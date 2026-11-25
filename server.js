const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DatabaseSync}=require('node:sqlite'); // Node 22.13+ এ বিল্ট-ইন, কোনো প্যাকেজ লাগে না
const PORT=process.env.PORT||3000, OLD=path.join(__dirname,'data.json');
const sql=new DatabaseSync(process.env.DB_FILE||path.join(__dirname,'portal.db'));
sql.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(u TEXT PRIMARY KEY,salt TEXT NOT NULL,hash TEXT NOT NULL,role TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS quizzes(id TEXT PRIMARY KEY,subject TEXT NOT NULL,title TEXT NOT NULL,questions TEXT NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,u TEXT NOT NULL,quiz_id TEXT NOT NULL,title TEXT NOT NULL,subject TEXT NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,u TEXT NOT NULL,role TEXT NOT NULL,created INTEGER NOT NULL);`);
{const cols=sql.prepare('PRAGMA table_info(users)').all().map(c=>c.name);
 if(!cols.includes('name'))sql.exec("ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT ''");
 if(!cols.includes('created'))sql.exec("ALTER TABLE users ADD COLUMN created INTEGER NOT NULL DEFAULT 0");}
{const ac=sql.prepare('PRAGMA table_info(attempts)').all().map(c=>c.name);
 if(!ac.includes('answers'))sql.exec("ALTER TABLE attempts ADD COLUMN answers TEXT");
 if(!ac.includes('snapshot'))sql.exec("ALTER TABLE attempts ADD COLUMN snapshot TEXT");}
const hash=(p,salt)=>crypto.scryptSync(p,salt,32).toString('hex');
const mkUser=(u,p,role)=>{const salt=crypto.randomBytes(8).toString('hex');return{u,salt,hash:hash(p,salt),role}};
const uid=()=>crypto.randomBytes(5).toString('hex');
const q$=s=>sql.prepare(s);
const addUser=x=>q$('INSERT INTO users(u,salt,hash,role,created) VALUES(?,?,?,?,?)').run(x.u,x.salt,x.hash,x.role,Date.now());
const getUser=u=>q$('SELECT * FROM users WHERE u=?').get(u);
const addQuiz=x=>q$('INSERT INTO quizzes VALUES(?,?,?,?,?)').run(x.id,x.subject,x.title,JSON.stringify(x.questions),Date.now());
const rowQ=r=>r&&{id:r.id,subject:r.subject,title:r.title,questions:JSON.parse(r.questions)};
const allQuizzes=()=>q$('SELECT * FROM quizzes ORDER BY created').all().map(rowQ);
const getQuiz=id=>rowQ(q$('SELECT * FROM quizzes WHERE id=?').get(id));
// প্রথমবার চালালে: পুরোনো data.json থাকলে তা ইমপোর্ট, নইলে ডিফল্ট ডেটা
if(!q$('SELECT COUNT(*) c FROM users').get().c){
  let old=null;try{old=JSON.parse(fs.readFileSync(OLD,'utf8'))}catch(e){}
  if(old){old.users.forEach(addUser);old.quizzes.forEach(addQuiz);console.log('data.json থেকে ডেটা ইমপোর্ট হয়েছে')}
  else{addUser(mkUser('admin',process.env.ADMIN_PASSWORD||'admin123','admin'));
    if(!process.env.ADMIN_PASSWORD)console.warn('সতর্কতা: অ্যাডমিনের পাসওয়ার্ড admin123। অনলাইনে দেওয়ার আগে ADMIN_PASSWORD সেট করুন।');[
   {id:'p1',subject:'physics',title:'গতি ও বল',questions:[{q:'বলের SI একক কী?',opts:['জুল','নিউটন','ওয়াট','প্যাসকেল'],a:1}]},
   {id:'c1',subject:'chemistry',title:'মৌলের পর্যায় সারণি',questions:[{q:'পানির সংকেত কী?',opts:['CO2','H2O','NaCl','O2'],a:1}]},
   {id:'m1',subject:'math',title:'বীজগণিত পরিচিতি',questions:[{q:'(a+b)² = ?',opts:['a²+b²','a²+2ab+b²','a²-2ab+b²','2a+2b'],a:1}]}].forEach(addQuiz)}
}
const ALLOWED=process.env.ALLOWED_ORIGIN||''; // ফ্রন্টএন্ড অন্য ঠিকানায় (যেমন GitHub Pages) থাকলে সেই ঠিকানা দিন
const fails=new Map(); // লগইনে বারবার ভুল চেষ্টা আটকানো
const limited=ip=>{const f=fails.get(ip);return !!f&&f.n>=10&&Date.now()-f.t<600000};
const SESSION_DAYS=30;
q$('DELETE FROM sessions WHERE created<?').run(Date.now()-SESSION_DAYS*864e5);
const getSession=t=>t?q$('SELECT s.u,s.role,u.name FROM sessions s JOIN users u ON u.u=s.u WHERE s.token=?').get(t):null;
const SUBJ=['physics','chemistry','math'];
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj))};
const body=req=>new Promise(r=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)req.destroy()});req.on('end',()=>{try{r(JSON.parse(d||'{}'))}catch(e){r({})}})});
function clean(q){ // কুইজ যাচাই
  if(!q||typeof q.title!=='string'||!q.title.trim()||!SUBJ.includes(q.subject)||!Array.isArray(q.questions)||!q.questions.length)return null;
  const qs=q.questions.map(x=>({q:String(x.q||'').trim(),opts:(x.opts||[]).slice(0,4).map(o=>String(o).trim()),a:Number(x.a)}));
  if(qs.some(x=>!x.q||x.opts.length!==4||x.opts.some(o=>!o)||!(x.a>=0&&x.a<4)))return null;
  return{subject:q.subject,title:q.title.trim(),questions:qs};
}
const hideAns=q=>({...q,questions:q.questions.map(({a,...r})=>r)});
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png'};
const FILES=new Set(['index.html','style.css','app.js','config.js','favicon.svg','favicon.ico','apple-touch-icon.png']);
async function api(req,res,url){
  const tok=(req.headers.authorization||'').replace('Bearer ','');const me=getSession(tok);
  const ip=(req.headers['x-forwarded-for']||'').split(',')[0].trim()||req.socket.remoteAddress;
  const m=req.method,p=url.pathname,b=m==='GET'||m==='DELETE'?{}:await body(req);
  if(p==='/api/register'&&m==='POST'){
    const u=String(b.u||'').trim(),pw=String(b.p||'');
    if(u.length<3||pw.length<4)return send(res,400,{error:'ইউজারনেম ৩+ ও পাসওয়ার্ড ৪+ অক্ষরের হতে হবে।'});
    if(getUser(u))return send(res,409,{error:'এই ইউজারনেম আগে থেকেই আছে।'});
    const nu=mkUser(u,pw,'student');addUser(nu);return login(res,nu);
  }
  if(p==='/api/login'&&m==='POST'){
    if(limited(ip))return send(res,429,{error:'অনেকবার ভুল চেষ্টা হয়েছে। ১০ মিনিট পরে আবার চেষ্টা করুন।'});
    const x=getUser(String(b.u||''));
    if(!x||hash(String(b.p||''),x.salt)!==x.hash){const f=fails.get(ip);fails.set(ip,{n:(f&&Date.now()-f.t<600000?f.n:0)+1,t:Date.now()});return send(res,401,{error:'ইউজারনেম বা পাসওয়ার্ড ভুল।'})}
    fails.delete(ip);return login(res,x);
  }
  if(!me)return send(res,401,{error:'আগে লগইন করুন।'});
  if(p==='/api/me')return send(res,200,me);
  if(p==='/api/logout'){q$('DELETE FROM sessions WHERE token=?').run(tok);return send(res,200,{ok:1})}
  let rr=p.match(/^\/api\/results\/(\d+)$/);
  if(rr&&m==='GET'){ // একটি চেষ্টার বিস্তারিত: নিজের (অ্যাডমিন হলে যে কারও)
    const a=q$('SELECT * FROM attempts WHERE id=?').get(Number(rr[1]));
    if(!a||(me.role!=='admin'&&a.u!==me.u))return send(res,404,{error:'ফলাফল পাওয়া যায়নি।'});
    return send(res,200,{id:a.id,u:a.u,title:a.title,subject:a.subject,score:a.score,total:a.total,created:a.created,
      answers:a.answers?JSON.parse(a.answers):null,questions:a.snapshot?JSON.parse(a.snapshot):null})}
  if(p==='/api/profile'&&m==='GET'){
    const u=getUser(me.u);const st=q$('SELECT COUNT(*) n,AVG(score*100.0/total) a FROM attempts WHERE u=?').get(me.u);
    return send(res,200,{u:u.u,role:u.role,name:u.name||'',created:u.created||0,attempts:st.n,avg:Math.round(st.a||0)})}
  if(p==='/api/profile'&&m==='PUT'){
    const name=String(b.name||'').trim().slice(0,40);
    q$('UPDATE users SET name=? WHERE u=?').run(name,me.u);return send(res,200,{name})}
  if(p==='/api/password'&&m==='PUT'){
    const u=getUser(me.u),np=String(b.newPass||'');
    if(hash(String(b.oldPass||''),u.salt)!==u.hash)return send(res,400,{error:'বর্তমান পাসওয়ার্ড ভুল।'});
    if(np.length<4)return send(res,400,{error:'নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।'});
    const salt=crypto.randomBytes(8).toString('hex');
    q$('UPDATE users SET salt=?,hash=? WHERE u=?').run(salt,hash(np,salt),me.u);
    q$('DELETE FROM sessions WHERE u=? AND token<>?').run(me.u,tok); // অন্য ডিভাইসের সেশন বন্ধ
    return send(res,200,{ok:1})}
  if(p==='/api/quizzes'&&m==='GET')return send(res,200,me.role==='admin'?allQuizzes():allQuizzes().map(hideAns));
  let r=p.match(/^\/api\/quizzes\/([\w-]+)\/submit$/);
  if(r&&m==='POST'){const q=getQuiz(r[1]);if(!q)return send(res,404,{error:'কুইজ পাওয়া যায়নি।'});
    const a=Array.isArray(b.answers)?b.answers:[];
    const score=q.questions.filter((x,i)=>a[i]===x.a).length;
    if(me.role!=='admin')q$('INSERT INTO attempts(u,quiz_id,title,subject,score,total,created,answers,snapshot) VALUES(?,?,?,?,?,?,?,?,?)').run(me.u,q.id,q.title,q.subject,score,q.questions.length,Date.now(),JSON.stringify(q.questions.map((x,i)=>Number.isInteger(a[i])?a[i]:-1)),JSON.stringify(q.questions));
    return send(res,200,{score,total:q.questions.length,correct:q.questions.map(x=>x.a)})}
  if(p==='/api/results'&&m==='GET'){ // অ্যাডমিন সবার, স্টুডেন্ট শুধু নিজের ফলাফল দেখে
    const rows=me.role==='admin'?q$('SELECT id,u,quiz_id,title,subject,score,total,created FROM attempts ORDER BY created DESC LIMIT 1000').all()
      :q$('SELECT id,u,quiz_id,title,subject,score,total,created FROM attempts WHERE u=? ORDER BY created DESC LIMIT 1000').all(me.u);
    return send(res,200,rows)}
  if(me.role!=='admin'&&(m!=='GET'))return send(res,403,{error:'শুধু অ্যাডমিন এটা করতে পারবেন।'});
  if(p==='/api/quizzes'&&m==='POST'){const q=clean(b);if(!q)return send(res,400,{error:'কুইজের তথ্য সম্পূর্ণ নয়।'});
    const n={id:uid(),...q};addQuiz(n);return send(res,201,n)}
  r=p.match(/^\/api\/quizzes\/([\w-]+)$/);
  if(r){if(!getQuiz(r[1]))return send(res,404,{error:'কুইজ পাওয়া যায়নি।'});
    if(m==='PUT'){const q=clean(b);if(!q)return send(res,400,{error:'কুইজের তথ্য সম্পূর্ণ নয়।'});q$('UPDATE quizzes SET subject=?,title=?,questions=? WHERE id=?').run(q.subject,q.title,JSON.stringify(q.questions),r[1]);return send(res,200,{id:r[1],...q})}
    if(m==='DELETE'){q$('DELETE FROM quizzes WHERE id=?').run(r[1]);return send(res,200,{ok:1})}}
  send(res,404,{error:'পাওয়া যায়নি।'});
}
function login(res,x){const t=crypto.randomBytes(24).toString('hex');q$('INSERT INTO sessions VALUES(?,?,?,?)').run(t,x.u,x.role,Date.now());send(res,200,{token:t,u:x.u,role:x.role,name:x.name||''})}
http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,'http://x');
    const o=req.headers.origin;
    if(o&&ALLOWED&&(ALLOWED==='*'||o===ALLOWED)){res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');
      res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS')}
    if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    const f=url.pathname==='/'?'index.html':url.pathname.slice(1);
    if(!FILES.has(f)){res.writeHead(404);return res.end('Not found')}
    res.writeHead(200,{'Content-Type':MIME[path.extname(f)]});fs.createReadStream(path.join(__dirname,f)).pipe(res);
  }catch(e){console.error(e);send(res,500,{error:'সার্ভারে সমস্যা হয়েছে।'})}
}).listen(PORT,()=>console.log('চালু: http://localhost:'+PORT));
