/* Static scientific explorer. No model calls, telemetry or remote data requests. */
'use strict';
const $=id=>document.getElementById(id);
const colors=['#007b79','#bc663c','#4869a3','#9a7098','#7a8e38','#c29439','#3c9bad','#875c50','#637980'];
const config={responsive:true,displaylogo:false,toImageButtonOptions:{format:'png',scale:2}};
const cache=new Map();
let manifest,lookup,currentPage,currentDataset,rows=[],filtered=[],tablePage=0,epoch=0,plotEpoch=0,filters={};
window.__geometryReady=false;
window.__geometryState={status:'loading'};
const format=v=>v==null?'—':typeof v==='number'?(Number.isInteger(v)?String(v):Number(v.toPrecision(6)).toString()):String(v);
const unique=values=>[...new Set(values.filter(v=>v!==null&&v!==undefined&&v!==''))];
function options(select,values,chosen){select.replaceChildren();for(const v of values){const o=document.createElement('option');o.value=typeof v==='object'?v.value:v;o.textContent=typeof v==='object'?v.label:v;select.append(o);}if(chosen!==undefined&&[...select.options].some(o=>o.value===String(chosen)))select.value=String(chosen);}
function textEl(tag,text,className){const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;}
async function getJSON(url){if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error(`${url}: HTTP ${r.status}`);return r.json();}));return cache.get(url);}
function fail(err){console.error(err);$('error').textContent=`This view could not load: ${err.message}. Please check that the site includes its exported data and shared Plotly library.`;$('error').hidden=false;window.__geometryState.status='error';window.__geometryReady=false;}
function layout(extra={}){return {paper_bgcolor:'transparent',plot_bgcolor:'#fff',font:{family:'-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',color:'#314e59',size:11},margin:{l:65,r:25,t:25,b:65},colorway:colors,hovermode:'closest',legend:{orientation:'h',y:-.22},xaxis:{gridcolor:'#edf1f2',zerolinecolor:'#d7e2e4'},yaxis:{gridcolor:'#edf1f2',zerolinecolor:'#d7e2e4'},...extra};}

function buildNav(){
  const groups=new Map();for(const p of manifest.pages){if(!groups.has(p.topic))groups.set(p.topic,[]);groups.get(p.topic).push(p);}
  options($('section-select'),manifest.pages.map(p=>({value:p.id,label:`${String(p.id).padStart(2,'0')} · ${p.title}`})));
  for(const [topic,pages] of groups){$('section-nav').append(textEl('div',topic,'nav-topic'));for(const p of pages){const b=document.createElement('button');b.className='section-button';b.dataset.section=String(p.id);b.append(textEl('span',String(p.id).padStart(2,'0'),'number'),textEl('span',p.title));b.addEventListener('click',()=>changePage(p.id));$('section-nav').append(b);}}
  $('section-select').addEventListener('change',()=>changePage(Number($('section-select').value)));
  $('section-search').addEventListener('input',()=>{const q=$('section-search').value.toLowerCase();for(const b of document.querySelectorAll('[data-section]')){const p=manifest.pages.find(p=>p.id===Number(b.dataset.section));b.hidden=!`${p.title} ${p.topic} ${p.description}`.toLowerCase().includes(q);}});
}

const preferred={1:'concept_axis_diagnosis',2:'steering_saturation_summary',3:'convergent_validation',4:'carrier_vs_wres',5:'wres_stability_final',6:'active_set_overlap',7:'w_res/u projection',8:'wres_stability_final',9:'icc_per_cluster',12:'pairs_best_per_family',13:'usage_geometry',16:'forced_geometry',17:'calculus_points',18:'carrier_geometry',19:'error_trajectory',20:'healing_forced',21:'logitlens',22:'head_scores',23:'single_layer_sweep',24:'geometry.csv',26:'active_span_triad',27:'cross_concept_within',28:'triad_type_summary',29:'battery_summary',30:'cross_concept_within',31:'geometric_atlas_multiclass',32:'delta_deepdive',33:'steering_sweep_tier1',34:'rotsync',35:'Recomputed vector',36:'Recomputed vector',37:'geometry_normfree'};
Object.assign(preferred,{1:'summary.D1',2:'steering saturation summary · summary.curve',3:'summary.convergent_validation',5:'summary.wres_stability_cos',6:'summary.per_layer / groups',8:'summary.wres_stability_cos',24:'geometry by layer'});
function chooseDataset(p){const ds=p.datasets.map(id=>lookup.get(id));return (ds.find(d=>(d.source+' '+d.title).includes(preferred[p.id])&&d.numeric.length>0&&d.rows>2)||ds.find(d=>d.numeric.length>0&&d.rows>2)||ds[0]).id;}
async function changePage(id){
  const token=++epoch;window.__geometryReady=false;window.__geometryState={status:'loading',page:id};$('error').hidden=true;
  currentPage=manifest.pages.find(p=>p.id===Number(id))||manifest.pages[0];
  $('section-select').value=String(currentPage.id);for(const b of document.querySelectorAll('[data-section]'))b.classList.toggle('active',Number(b.dataset.section)===currentPage.id);
  $('topic').textContent=`SECTION ${String(currentPage.id).padStart(2,'0')} / ${currentPage.topic}`;$('page-title').textContent=currentPage.title;$('page-description').textContent=currentPage.description;$('formula').textContent=currentPage.formula;$('page-note').textContent=currentPage.note;
  $('dataset-count').textContent=`${currentPage.datasets.length} saved tables`;
  options($('dataset-select'),currentPage.datasets.map(id=>({value:id,label:lookup.get(id).title})),chooseDataset(currentPage));
  $('source-page').textContent=`Archived page: ${currentPage.source_page}`;
  $('scope-details').replaceChildren(textEl('p',manifest.scope),...manifest.limitations.map(s=>textEl('p',s)),textEl('p',manifest.privacy));
  if(currentPage.unavailable_sources.length){$('scope-details').append(textEl('p','Optional source variants not present in this restored dataset:'));const ul=document.createElement('ul');for(const src of currentPage.unavailable_sources)ul.append(textEl('li',src));$('scope-details').append(ul);}
  history.replaceState(null,'',`#section=${currentPage.id}`);
  try{await Promise.all([changeDataset($('dataset-select').value,token),renderSpecial(currentPage,token)]);if(token===epoch){window.__geometryReady=true;window.__geometryState.status='ready';}}catch(e){if(token===epoch)fail(e);}
}

function chooseY(ds){const target={1:'heldout_auc',2:'wres_flip',3:'auc_fisher',4:'carrier_capture_wres',5:'value',6:'mean_jaccard',8:'value',9:'ICC',12:'overall_flip',13:'cos_u_wres',16:'auc_along_u_forced',17:'meas',18:'max_cos_u',19:'lens_failedbeta',20:'intact_flip',21:'auc_u',22:'answer_writer_score',23:'intact_wres',24:'cos_u_delta',26:'cap_u',27:'cos_u_delta',28:'single_axis_frac',29:'follow_cue_pct',30:'cos_u_delta',31:'decodability_Kclass',32:'norm_delta_scaffold',33:'flip_norm_intact',34:'rot_delta',35:'norm',36:'norm',37:'angle_deg'}[currentPage.id];const order=[target,'angle_deg','heldout_auc','auc','flip_norm_intact','intact_flip','wres_flip','flip_rate','meas','cos_u_delta','cos_ud','cosine','mean','value','mean_abs_effect_size','norm','rot_frac','y'];return order.find(c=>ds.numeric.includes(c))||ds.numeric.find(c=>!['layer','L','prompt_idx','prompt_index','index','feature','feature_id','seed','n','count','c','k','other_layer'].includes(c))||'__row';}
function chooseX(ds){if(ds.kind==='cloud'&&ds.columns.includes('x'))return 'x';if(ds.columns.includes('c')&&ds.columns.includes('wres_flip'))return 'c';if(currentPage.id===9&&ds.columns.includes('cluster_id'))return 'cluster_id';if(currentPage.id===12&&ds.columns.includes('family'))return 'family';if(ds.columns.includes('pred')&&ds.columns.includes('meas'))return 'pred';return ['layer','L','tap','c','dk','step','metric','group','prompt_index','prompt_idx','index','x'].find(c=>ds.columns.includes(c))||ds.columns.find(c=>c!==chooseY(ds))||'__row';}
function resetControls(){
  const ds=currentDataset;filters={};tablePage=0;$('row-search').value='';$('log-y').checked=false;
  options($('x-select'),[...ds.columns,'__row'],chooseX(ds));options($('y-select'),[...ds.numeric,'__row'],chooseY(ds));
  const groupCols=ds.columns.filter(c=>{const n=unique(rows.map(r=>r[c])).length;return n>1&&n<=80;});
  let group=['dir','axis','concept','regime','dataset','mode','group','class','class_label','kind','source','tap','family'].find(c=>groupCols.includes(c)&&c!==$('x-select').value&&c!==$('y-select').value)||'';
  if(ds.kind==='cloud'){group='class_label';if(ds.columns.includes('layer'))filters.layer=20;}
  if(ds.title.startsWith('Recomputed vector')&&ds.columns.includes('dataset'))filters.dataset=rows[0].dataset;
  if(currentPage.id===37&&ds.columns.includes('angle_deg')&&ds.columns.includes('group')){group='group';filters.axis='delta';}
  options($('group-select'),[{value:'',label:'All rows'},...groupCols],group);
  $('chart-select').value=ds.kind==='heatmap'||currentPage.id===37&&ds.columns.includes('angle_deg')?'heatmap':['metric','cluster_id'].includes($('x-select').value)?'bar':ds.kind==='prompts'||ds.kind==='cloud'||$('x-select').value==='pred'?'scatter':'line';
  if(ds.kind==='heatmap'&&groupCols.includes('other_layer'))$('group-select').value='other_layer';
  buildFilters();return redraw();
}
async function changeDataset(id,token=epoch){
  window.__geometryReady=false;window.__geometryState.status='loading';
  const ds=lookup.get(id);if(!ds)throw new Error('Unknown dataset');
  const data=await getJSON(ds.url);if(token!==epoch)return;
  currentDataset=ds;rows=data.rows.map((r,i)=>Object.assign(Array.isArray(r)?Object.fromEntries(data.columns.map((c,j)=>[c,r[j]])):{...r},{__row:i}));
  $('dataset-description').textContent=`${ds.rows.toLocaleString()} complete saved rows · ${ds.columns.length} fields${ds.note?' · '+ds.note:''}`;
  $('source-current').textContent=`Scientific source: ${ds.source}`;$('download-json').href=ds.url;$('download-json').download=`chapter6-${ds.id}.json`;
  await resetControls();
}
function buildFilters(){
  $('filters').replaceChildren();
  const priority=['axis','dir','direction','dataset','concept','regime','subset','arm','mode','tap','class','class_label','source','family','wording_family','layer','c','group'];
  const cols=priority.filter(c=>currentDataset.columns.includes(c)&&c!==$('x-select').value&&c!==$('group-select').value&&c!==$('y-select').value&&unique(rows.map(r=>r[c])).length>1&&unique(rows.map(r=>r[c])).length<=80).slice(0,6);
  for(const c of cols){const label=textEl('label',c);const select=document.createElement('select');select.dataset.filter=c;const vals=unique(rows.map(r=>r[c])).sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b)));options(select,[{value:'',label:'All'},...vals.map(v=>({value:JSON.stringify(v),label:String(v)}))],filters[c]===undefined?'':JSON.stringify(filters[c]));select.addEventListener('change',()=>{if(select.value==='')delete filters[c];else filters[c]=JSON.parse(select.value);tablePage=0;redraw().catch(fail);});label.append(select);$('filters').append(label);}
  for(const key of Object.keys(filters))if(!cols.includes(key))delete filters[key];
}
function selectedRows(){const q=$('row-search').value.trim().toLowerCase();return rows.filter(r=>Object.entries(filters).every(([c,v])=>r[c]===v)&&(!q||Object.values(r).some(v=>String(v??'').toLowerCase().includes(q))));}
function getXY(r,x,y){return [r[x],r[y]];}
async function redraw(){
  const thisPlot=++plotEpoch;const thisPage=epoch;window.__geometryReady=false;window.__geometryState.status='rendering';
  filtered=selectedRows();renderTable();const x=$('x-select').value,y=$('y-select').value,g=$('group-select').value,chart=$('chart-select').value;
  const valid=filtered.filter(r=>typeof r[y]==='number'&&Number.isFinite(r[y])&&r[x]!=null);let traces=[];let caption='';
  const grouped=new Map();for(const r of valid){const key=g?String(r[g]??'Missing'):'Saved rows';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(r);}
  let plotRows=valid.length;
  if(chart==='heatmap'){
    const xs=unique(valid.map(r=>r[x])).sort((a,b)=>typeof a==='number'&&typeof b==='number'?a-b:String(a).localeCompare(String(b)));
    const gs=[...grouped.keys()];const sums=new Map();for(const r of valid){const key=JSON.stringify([g?String(r[g]??'Missing'):'Saved rows',r[x]]);const c=sums.get(key)||[0,0];c[0]+=r[y];c[1]++;sums.set(key,c);}
    const z=gs.map(group=>xs.map(xx=>{const c=sums.get(JSON.stringify([group,xx]));return c?c[0]/c[1]:null;}));traces=[{type:'heatmap',x:xs,y:gs,z,colorscale:'Viridis',colorbar:{title:{text:y}},hoverongaps:false}];caption='Each populated cell shows the arithmetic mean of its matching rows; missing cells remain empty.';
  }else{
    let gi=0;for(const [name,rr] of grouped){
      let data=rr;if(chart!=='histogram'&&valid.length>10000){const stride=Math.ceil(valid.length/10000);data=rr.filter((_,i)=>i%stride===0);}
      if(chart==='line')data=[...data].sort((a,b)=>typeof a[x]==='number'&&typeof b[x]==='number'?a[x]-b[x]:String(a[x]).localeCompare(String(b[x])));
      const xx=data.map(r=>r[x]),yy=data.map(r=>r[y]);const color=colors[gi++%colors.length];
      if(chart==='histogram')traces.push({type:'histogram',x:rr.map(r=>r[y]),name,opacity:.65,marker:{color},histnorm:''});
      else if(chart==='bar')traces.push({type:'bar',x:xx,y:yy,name,marker:{color}});
      else traces.push({type:'scattergl',mode:chart==='line'?'lines+markers':'markers',x:xx,y:yy,name,line:{width:1.7,color},marker:{size:chart==='scatter'?5:4,color,opacity:.75},customdata:data.map(r=>r.__row),hovertemplate:`${x}: %{x}<br>${y}: %{y}<br>source row: %{customdata}<extra>%{fullData.name}</extra>`});
    }
    caption=valid.length>10000&&chart!=='histogram'?'The chart displays a deterministic sample of at most about 10,000 points for responsiveness. The table and downloads retain every filtered row.':'Every finite matching row is plotted. No significance test or causal conclusion is added.';
    if(chart==='line')caption+=' Lines connect rows within a series; duplicate X values are not averaged.';
  }
  const settings=layout({xaxis:{title:{text:chart==='histogram'?y:x},gridcolor:'#edf1f2'},yaxis:{title:{text:chart==='histogram'?'Row count':chart==='heatmap'?(g||'Group'):y},gridcolor:'#edf1f2',type:$('log-y').checked&&chart!=='heatmap'?'log':'linear'},barmode:chart==='histogram'?'overlay':'group',showlegend:grouped.size>1&&grouped.size<=25});
  if(!valid.length){settings.annotations=[{text:'No finite numeric values match this selection. Inspect the table or choose another Y field.',xref:'paper',yref:'paper',x:.5,y:.5,showarrow:false,font:{size:13,color:'#60727a'}}];}
  await Plotly.react('plot',traces,settings,config);if(thisPage!==epoch||thisPlot!==plotEpoch)return;
  $('plot-caption').textContent=`${valid.length.toLocaleString()} numeric rows / ${filtered.length.toLocaleString()} filtered rows / ${rows.length.toLocaleString()} total. ${caption}${$('log-y').checked?' A logarithmic axis cannot display nonpositive values.':''}`;
  window.__geometryState={status:'ready',page:currentPage.id,dataset:currentDataset.id,rows:rows.length,filteredRows:filtered.length,plotRows,chart};window.__geometryReady=true;
}
function renderTable(){
  const size=40;const max=Math.max(0,Math.ceil(filtered.length/size)-1);tablePage=Math.min(tablePage,max);const columns=currentDataset.columns;
  const tr=document.createElement('tr');for(const c of columns)tr.append(textEl('th',c));$('data-table').querySelector('thead').replaceChildren(tr);
  const body=$('data-table').querySelector('tbody');body.replaceChildren();for(const r of filtered.slice(tablePage*size,(tablePage+1)*size)){const row=document.createElement('tr');for(const c of columns)row.append(textEl('td',format(r[c]),typeof r[c]==='number'?'num':''));body.append(row);}
  $('table-caption').textContent=filtered.length?`Rows ${(tablePage*size+1).toLocaleString()}–${Math.min((tablePage+1)*size,filtered.length).toLocaleString()} of ${filtered.length.toLocaleString()}. Values shown with up to 6 significant digits; downloads preserve export precision.`:'No rows match these filters.';
  $('table-prev').disabled=tablePage===0;$('table-next').disabled=tablePage>=max;
}
function downloadCSV(){const cols=currentDataset.columns;const cell=v=>{if(v==null)return '';let s=String(v);if(typeof v==='string'&&/^[=+@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};const csv=[cols.map(cell).join(','),...filtered.map(r=>cols.map(c=>cell(r[c])).join(','))].join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`chapter6-section${currentPage.id}-${currentDataset.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}

function control(label,kind,id,opts){const l=textEl('label',label),e=document.createElement(kind);e.id=id;if(kind==='select')options(e,opts);l.append(e);$('special-controls').append(l);return e;}
async function renderSpecial(page,token){
  $('special-controls').replaceChildren();$('special').hidden=!page.special;if(!page.special)return;
  if(page.special==='cloud'){
    $('special-title').textContent=page.id===33?'Translate a saved prompt cloud':'Prompt clouds across depth';
    const metas=await getJSON('data/clouds.json');if(token!==epoch)return;
    const regime=control('Prompt regime','select','cloud-regime',metas.map(m=>({value:m.id,label:m.label})));
    const plane=control('Projection plane','select','cloud-plane',metas[0].planes);
    const axis=control('Projected axis','select','cloud-axis',metas[0].axes);
    const layer=control('Layer','input','cloud-layer-slider');layer.type='range';layer.min=0;layer.max=35;layer.value=20;layer.step=1;
    const shift=control('Geometric shift · c × σ_plot','input','cloud-shift');shift.type='range';shift.min=-3;shift.max=3;shift.step=.25;shift.value=0;
    const draw=async()=>{
      const m=metas.find(m=>m.id===regime.value);const L=Number(layer.value);const data=await getJSON(`data/cloud-${m.id}-${L}.json`);if(token!==epoch)return;
      const xy=data.coords[plane.value];const a=data.arrows[plane.value][m.axes.indexOf(axis.value)];const an=Math.hypot(...a);const unit=an>1e-12?a.map(v=>v/an):[0,0];
      const projection=xy.map(p=>p[0]*unit[0]+p[1]*unit[1]);const mean=projection.reduce((s,v)=>s+v,0)/projection.length;const sigma=Math.sqrt(projection.reduce((s,v)=>s+(v-mean)**2,0)/projection.length);const c=Number(shift.value);const delta=unit.map(v=>v*sigma*c);const ts=[];
      for(const label of unique(m.labels)){const ids=m.labels.map((v,i)=>v===label?i:-1).filter(i=>i>=0);ts.push({type:'scattergl',mode:'markers',name:`Class ${label} · original`,x:ids.map(i=>xy[i][0]),y:ids.map(i=>xy[i][1]),customdata:ids.map(i=>[i,m.families[i]]),marker:{color:colors[Number(label)%colors.length],size:5,opacity:c===0?.7:.2},hovertemplate:'Prompt %{customdata[0]} · %{customdata[1]}<br>x %{x:.4g}, y %{y:.4g}<extra>%{fullData.name}</extra>'});if(c!==0)ts.push({type:'scattergl',mode:'markers',name:`Class ${label} · translated`,x:ids.map(i=>xy[i][0]+delta[0]),y:ids.map(i=>xy[i][1]+delta[1]),marker:{color:colors[Number(label)%colors.length],size:5,opacity:.7,symbol:'diamond'}});}
      const spread=Math.max(...xy.map(p=>Math.hypot(...p)))*.45;
      const annotations=m.axes.map((label,i)=>{const v=data.arrows[plane.value][i];return {x:v[0]*spread,y:v[1]*spread,ax:0,ay:0,axref:'x',ayref:'y',xref:'x',yref:'y',text:label,showarrow:true,arrowhead:3,arrowwidth:2,arrowcolor:colors[i+2],font:{color:colors[i+2],size:12}};});
      const split=plane.value.split('_');await Plotly.react('special-plot',ts,layout({title:{text:`${m.label} · L${L} · ${plane.value}`,font:{size:14}},xaxis:{title:'Saved projection coordinate 1',gridcolor:'#edf1f2'},yaxis:{title:'Saved projection coordinate 2',gridcolor:'#edf1f2',scaleanchor:'x',scaleratio:1},annotations,margin:{l:65,r:20,t:45,b:65}}),config);
      $('special-caption').textContent=`${m.n} saved points. Arrows show projected axes with a common display scale. Layer ${L}; c = ${c}; σ_plot = ${format(sigma)} along the normalized 2D arrow. The shift is a display translation, not a new model intervention or prediction of flips. Source: ${m.source}.`;
      window.__geometryCloud={regime:m.id,layer:L,plane:plane.value,c,points:m.n};
    };
    for(const el of [regime,plane,axis,layer,shift])el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>draw().catch(fail));await draw();
  }else{
    $('special-title').textContent='Actual vectors, projected into an SVD basis';const trajectories=await getJSON('data/trajectories.json');if(token!==epoch)return;
    const dataset=control('Saved trajectory','select','trajectory-axis',trajectories.map(t=>({value:t.id,label:t.label+' · '+t.axis})));
    const dimension=control('View','select','trajectory-dimension',[{value:'2',label:'2D plane'},{value:'3',label:'3D projection'}]);
    const length=control('Arrow lengths','select','trajectory-length',[{value:'unit',label:'Unit vectors (direction)'},{value:'norm',label:'Relative saved norm'}]);
    const depth=control('Highlight layer','input','trajectory-layer');depth.type='range';depth.min=0;depth.value=0;depth.step=1;
    const draw=async()=>{
      const t=trajectories.find(t=>t.id===dataset.value);depth.max=t.layers.length-1;const hi=Math.min(Number(depth.value),t.layers.length-1);const largest=Math.max(...t.norms);const coords=t.coords.map((p,i)=>p.map(x=>x*(length.value==='norm'?t.norms[i]/(largest||1):1)));const is3d=dimension.value==='3';const ts=[];
      for(let i=0;i<coords.length;i++){const p=coords[i];const color=i===hi?'#b66332':'rgba(0,123,121,.24)';ts.push({type:is3d?'scatter3d':'scatter',mode:'lines',x:[0,p[0]],y:[0,p[1]],...(is3d?{z:[0,p[2]]}:{}),line:{color,width:i===hi?4:1.2},showlegend:false,hoverinfo:'skip'});}
      ts.push({type:is3d?'scatter3d':'scatter',mode:'markers',x:coords.map(p=>p[0]),y:coords.map(p=>p[1]),...(is3d?{z:coords.map(p=>p[2])}:{}),marker:{size:6,color:t.layers,colorscale:'Viridis',colorbar:{title:{text:'Layer'}}},customdata:t.layers.map((L,i)=>[L,t.norms[i]]),hovertemplate:'Layer %{customdata[0]}<br>Saved norm %{customdata[1]:.5g}<extra></extra>',showlegend:false});
      await Plotly.react('special-plot',ts,layout({title:{text:`${t.label} · ${t.axis} · highlighted L${t.layers[hi]}`,font:{size:14}},xaxis:{title:'SVD 1'},yaxis:{title:'SVD 2',scaleanchor:'x',scaleratio:1},scene:{xaxis:{title:'SVD 1'},yaxis:{title:'SVD 2'},zaxis:{title:'SVD 3'},aspectmode:'cube'},margin:{l:60,r:25,t:45,b:50}}),config);
      $('special-caption').textContent=`${t.layers.length} available layers; ${is3d?3:2}D projection retains ${(100*(is3d?t.capture3:t.capture2)).toFixed(1)}% of squared singular values of the unit-vector trajectory. ${t.norm_meaning}. Each trajectory has its own fitted basis, so coordinates from different datasets are not directly comparable. Source: ${t.source}.`;
      window.__geometryTrajectory={id:t.id,dimension:Number(dimension.value),length:length.value,layer:t.layers[hi]};
    };
    for(const el of [dataset,dimension,length,depth])el.addEventListener(el.tagName==='INPUT'?'input':'change',()=>draw().catch(fail));await draw();
  }
}

async function init(){
  if(!window.Plotly)throw new Error('Shared Plotly library is missing');
  manifest=await getJSON('data/manifest.json');lookup=new Map(manifest.datasets.map(d=>[d.id,d]));buildNav();
  $('dataset-select').addEventListener('change',()=>changeDataset($('dataset-select').value).catch(fail));
  for(const id of ['chart-select','x-select','y-select','group-select','log-y'])$(id).addEventListener('change',()=>{if(['x-select','y-select','group-select'].includes(id))buildFilters();tablePage=0;redraw().catch(fail);});
  let searchTimer;$('row-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{tablePage=0;redraw().catch(fail);},180);});
  $('table-prev').addEventListener('click',()=>{tablePage--;renderTable();});$('table-next').addEventListener('click',()=>{tablePage++;renderTable();});$('download-csv').addEventListener('click',downloadCSV);$('reset-controls').addEventListener('click',()=>resetControls().catch(fail));
  const match=location.hash.match(/section=(\d+)/);await changePage(match?Number(match[1]):1);
}
init().catch(fail);
