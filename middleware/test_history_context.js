// Legacy fixtures have no journal IDs. Keep them isolated from production disk.
const history={validEvent:()=>false,getStore:()=>({has:()=>false,view:()=>({ok:true,total:0,events:[]})})};
module.exports={get:key=>key==='doorHistory'?history:require('./core')};
