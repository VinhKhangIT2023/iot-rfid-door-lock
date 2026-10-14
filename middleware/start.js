const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const settings=require('./settings.js'),origin='http://'+settings.uiHost+':'+settings.uiPort;
const probe=require('net').createServer();
probe.once('error',error=>{
  if(error.code==='EADDRINUSE')console.error('Cổng '+settings.uiPort+' đang được dùng. Kiểm tra Web tại '+origin+'/door. Không chạy thêm một bản; muốn khởi động lại, dừng dịch vụ cũ trước.');
  else console.error('Không mở được cổng Web: '+error.message);
  process.exitCode=1;
});
probe.listen(settings.uiPort,settings.uiHost,()=>probe.close(()=>{
  const file=path.join(__dirname,'operator_code.txt');
  if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(18).toString('hex'));
  const token=fs.readFileSync(file,'utf8').trim();
  if(!token){console.error('File operator_code.txt đang trống. Điền lại mã điều khiển trước khi chạy.');process.exitCode=1;return;}
  if(fs.existsSync(path.join(__dirname,'../application/index.html')))console.log('Ứng dụng: '+origin+'/door');console.log('Editor: '+origin+settings.httpAdminRoot);console.log('Mã điều khiển nằm trong '+file);
  const child=spawn(process.execPath,[require.resolve('node-red/red.js'),'--userDir',__dirname,'--settings',path.join(__dirname,'settings.js')],{stdio:'inherit',env:{...process.env,DOOR_OPERATOR_TOKEN:token}});
  child.on('error',error=>{console.error('Không khởi động được Node-RED: '+error.message);process.exitCode=1;});
  child.on('exit',code=>process.exit(code||0));process.on('SIGINT',()=>child.kill('SIGINT'));
}));
