const express=require("express");
const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const bcrypt=require("bcryptjs");
const cookieParser=require("cookie-parser");
const {Server}=require("socket.io");

const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000;
const SECRET=process.env.AUTH_SECRET||"dev-change-this-secret";
const DATA=path.join(__dirname,"data"), USERS=path.join(DATA,"users.json"), MESSAGES=path.join(DATA,"messages.json");
fs.mkdirSync(DATA,{recursive:true});

function read(file,fallback){try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):fallback}catch{return fallback}}
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2),"utf8")}
let users=read(USERS,[]),messages=read(MESSAGES,[]).slice(-5000);

app.set("trust proxy",1);
app.use(express.json({limit:"15mb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public")));

const pub=u=>({id:u.id,username:u.username,displayName:u.displayName,avatar:u.avatar||"",bio:u.bio||""});
const clean=(v,n)=>String(v??"").trim().slice(0,n);
function sign(id){const s=crypto.createHmac("sha256",SECRET).update(id).digest("hex");return id+"."+s}
function current(req){
  const t=req.cookies.chat_auth;if(!t)return null;
  const p=t.lastIndexOf(".");if(p<1)return null;
  const id=t.slice(0,p),sig=t.slice(p+1),e=crypto.createHmac("sha256",SECRET).update(id).digest("hex");
  if(sig.length!==e.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(e)))return null;
  return users.find(u=>u.id===id)||null;
}
function auth(req,res,next){const u=current(req);if(!u)return res.status(401).json({error:"ログインしてください"});req.user=u;next()}
function setAuth(res,id){res.cookie("chat_auth",sign(id),{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:604800000})}

app.get("/api/me",(req,res)=>{const u=current(req);res.json({user:u?pub(u):null})});
app.post("/api/register",async(req,res)=>{
  try{
    const username=clean(req.body.username,20).toLowerCase(),displayName=clean(req.body.displayName,30)||username,password=String(req.body.password||"");
    if(!/^[a-z0-9_]{3,20}$/.test(username))return res.status(400).json({error:"IDは英小文字・数字・_の3〜20文字"});
    if(password.length<6)return res.status(400).json({error:"パスワードは6文字以上"});
    if(users.some(u=>u.username===username))return res.status(409).json({error:"そのIDはすでに登録されています"});
    const u={id:crypto.randomUUID(),username,displayName,passwordHash:await bcrypt.hash(password,12),avatar:"",bio:""};
    users.push(u);write(USERS,users);setAuth(res,u.id);res.status(201).json({user:pub(u)});
  }catch(e){console.error(e);res.status(500).json({error:"登録処理でエラーが発生しました"})}
});
app.post("/api/login",async(req,res)=>{
  try{
    const username=clean(req.body.username,20).toLowerCase(),password=String(req.body.password||""),u=users.find(x=>x.username===username);
    if(!u||!(await bcrypt.compare(password,u.passwordHash)))return res.status(401).json({error:"IDまたはパスワードが違います"});
    setAuth(res,u.id);res.json({user:pub(u)});
  }catch(e){console.error(e);res.status(500).json({error:"ログイン処理でエラーが発生しました"})}
});
app.post("/api/logout",(req,res)=>{res.clearCookie("chat_auth");res.json({ok:true})});

app.put("/api/profile",auth,(req,res)=>{
  const name=clean(req.body.displayName,30),bio=clean(req.body.bio,500),avatar=String(req.body.avatar||"");
  if(!name)return res.status(400).json({error:"表示名を入力してください"});
  if(avatar.length>8*1024*1024)return res.status(400).json({error:"アイコンは8MB以下にしてください"});
  req.user.displayName=name;req.user.bio=bio;req.user.avatar=avatar;write(USERS,users);
  res.json({user:pub(req.user)});
});
app.get("/api/users/:id",(req,res)=>{
  const u=users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:"ユーザーが見つかりません"});
  res.json({user:pub(u)});
});

app.get("/api/messages",auth,(req,res)=>res.json(messages.slice(-5000)));
app.post("/api/messages",auth,(req,res)=>{
  const body=clean(req.body.text,2000),image=String(req.body.image||"");
  if(!body&&!image)return res.status(400).json({error:"メッセージまたは画像を入力してください"});
  if(image.length>12*1024*1024)return res.status(400).json({error:"画像は12MB以下にしてください"});
  let reply=null;
  if(req.body.replyTo){const t=messages.find(m=>m.id===req.body.replyTo);if(t)reply={id:t.id,username:t.username,text:t.text.slice(0,300)}}
  const m={id:crypto.randomUUID(),userId:req.user.id,username:req.user.username,displayName:req.user.displayName,avatar:req.user.avatar||"",text:body,image,reply,time:new Date().toISOString()};
  messages.push(m);messages=messages.slice(-5000);write(MESSAGES,messages);io.emit("message:new",m);res.status(201).json({message:m});
});
app.delete("/api/messages/:id",auth,(req,res)=>{
  const i=messages.findIndex(m=>m.id===req.params.id);if(i<0)return res.status(404).json({error:"見つかりません"});
  if(messages[i].userId!==req.user.id)return res.status(403).json({error:"自分のメッセージだけ削除できます"});
  messages.splice(i,1);write(MESSAGES,messages);io.emit("message:delete",req.params.id);res.json({ok:true});
});

io.on("connection",s=>{
  s.on("join",id=>{const u=users.find(x=>x.id===id);if(u){s.data.userId=id;s.data.userName=u.displayName}s.emit("online",io.engine.clientsCount);s.broadcast.emit("online",io.engine.clientsCount)});
  s.on("typing",v=>s.broadcast.emit("typing",{name:s.data.userName||"ユーザー",value:!!v}));
  s.on("disconnect",()=>io.emit("online",io.engine.clientsCount));
});
server.listen(PORT,"0.0.0.0",()=>console.log("Server listening on "+PORT));