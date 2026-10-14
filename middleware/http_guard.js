// Parse only the command endpoint before Node-RED's generic HTTP error handler.
const parseJson=require('body-parser').json({limit:'2kb'});
module.exports=function commandJson(req,res,next){
  if(req.method!=='POST'||!['/api/command','/api/cards','/api/monitor'].includes(req.url.split('?')[0]))return next();
  if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||''))
    return res.status(415).json({error:'content_type'});
  parseJson(req,res,error=>{
    if(error)return res.status(error.status===413?413:400).json({error:error.status===413?'payload_too_large':'invalid_json'});
    if(!req.body||Array.isArray(req.body)||typeof req.body!=='object')
      return res.status(400).json({error:'command_schema'});
    next();
  });
};
