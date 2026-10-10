const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const file=path.join(__dirname,'operator_code.txt');
if(!fs.existsSync(file))fs.writeFileSync(file,crypto.randomBytes(18).toString('hex'));
const token=fs.readFileSync(file,'utf8').trim();
if(fs.existsSync(path.join(__dirname,'../application/index.html')))console.log('Ứng dụng: http://127.0.0.1:1880/door');console.log('Editor: http://127.0.0.1:1880/editor');console.log('Mã điều khiển nằm trong '+file);
const child=spawn(process.execPath,[require.resolve('node-red/red.js'),'--userDir',__dirname,'--settings',path.join(__dirname,'settings.js')],{stdio:'inherit',env:{...process.env,DOOR_OPERATOR_TOKEN:token}});
child.on('exit',code=>process.exit(code||0));process.on('SIGINT',()=>child.kill('SIGINT'));
