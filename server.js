const express=require("express");
const http=require("http");
const fs=require("fs");
const path=require("path");
const crypto=require("crypto");
const bcrypt=require("bcryptjs");
const cookieParser=require("cookie-parser");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=process.env.PORT||3000;
const SECRET=process.env.AUTH_SECRET||"dev-change-this-secret";

const DATA=path.join(__dirname,"data");
const USERS=path.join(DATA,"users.json");
const MESSAGES=path.join(DATA,"messages.json");
fs.mkdirSync(DATA,{recursive:true});

function read(file,fallback){
  try{return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,"utf8")):fallback}
  catch(e){console.error("read error",file,e);return fallback}
}
function write(file,data){
  fs.writeFileSync(file,JSON.stringify(data,null,2),"utf8");
}
let users=read(USERS,[]);
let messages=read(MESSAGES,[]);

app.use(express.json({limit:"1mb"}));
app.use(cookieParser());
app.use(express.static(path.join(__dirname,"public")));

function publicUser(u){
  return {id:u.id,username:u.username,displayName:u.displayName,avatar:u.avatar||""};
}
function sign(id){
  const sig=crypto.createHmac("sha256",SECRET).update(id).digest("hex");
  return `${id}.${sig}`;
}
function verify(token){
  if(!token)return null;
  const p=token.lastIndexOf(".");
  if(p<1)return null;
  const id=token.slice(0,p),sig=token.slice(p+1);
  const expected=crypto.createHmac("sha256",SECRET).update(id).digest("hex");
  if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  return users.find(u=>u.id===id)||null;
}
function currentUser(req){return verify(req.cookies.chat_auth)}
function auth(req,res,next){
  const u=currentUser(req);
  if(!u)return res.status(401).json({error:"ログインしてください"});
  req.user=u;next();
}
function text(v,max){return String(v??"").trim().slice(0,max)}

app.get("/api/health",(req,res)=>res.json({ok:true}));

app.get("/api/me",(req,res)=>{
  const u=currentUser(req);
  res.json({user:u?publicUser(u):null});
});

app.post("/api/register",async(req,res)=>{
  try{
    const username=text(req.body.username,20).toLowerCase();
    const displayName=text(req.body.displayName,30)||username;
    const password=String(req.body.password||"");

    if(!/^[a-z0-9_]{3,20}$/.test(username))
      return res.status(400).json({error:"IDは英小文字・数字・_のみ、3〜20文字で入力してください"});
    if(password.length<6)
      return res.status(400).json({error:"パスワードは6文字以上にしてください"});
    if(users.some(u=>u.username===username))
      return res.status(409).json({error:"そのIDはすでに登録されています"});

    const user={
      id:crypto.randomUUID(),
      username,
      displayName,
      passwordHash:await bcrypt.hash(password,12),
      avatar:""
    };
    users.push(user);
    write(USERS,users);

    res.cookie("chat_auth",sign(user.id),{
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV==="production",
      maxAge:7*24*60*60*1000
    });
    res.status(201).json({ok:true,user:publicUser(user)});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"登録処理でエラーが発生しました"});
  }
});

app.post("/api/login",async(req,res)=>{
  try{
    const username=text(req.body.username,20).toLowerCase();
    const password=String(req.body.password||"");
    const user=users.find(u=>u.username===username);

    if(!user)return res.status(401).json({error:"IDまたはパスワードが違います"});
    const ok=await bcrypt.compare(password,user.passwordHash);
    if(!ok)return res.status(401).json({error:"IDまたはパスワードが違います"});

    res.cookie("chat_auth",sign(user.id),{
      httpOnly:true,
      sameSite:"lax",
      secure:process.env.NODE_ENV==="production",
      maxAge:7*24*60*60*1000
    });
    res.json({ok:true,user:publicUser(user)});
  }catch(e){
    console.error(e);
    res.status(500).json({error:"ログイン処理でエラーが発生しました"});
  }
});

app.post("/api/logout",(req,res)=>{
  res.clearCookie("chat_auth");
  res.json({ok:true});
});

app.put("/api/profile",auth,(req,res)=>{
  const name=text(req.body.displayName,30);
  const avatar=String(req.body.avatar||"");
  if(!name)return res.status(400).json({error:"表示名を入力してください"});
  if(avatar.length>350000)return res.status(400).json({error:"アイコンが大きすぎます"});
  req.user.displayName=name;
  req.user.avatar=avatar;
  write(USERS,users);
  res.json({ok:true,user:publicUser(req.user)});
});

app.get("/api/messages",auth,(req,res)=>{
  res.json(messages.slice(-500));
});

app.post("/api/messages",auth,(req,res)=>{
  const body=text(req.body.text,1000);
  if(!body)return res.status(400).json({error:"メッセージを入力してください"});

  let reply=null;
  if(req.body.replyTo){
    const target=messages.find(m=>m.id===req.body.replyTo);
    if(target)reply={id:target.id,username:target.username,text:target.text.slice(0,300)};
  }

  const m={
    id:crypto.randomUUID(),
    userId:req.user.id,
    username:req.user.username,
    displayName:req.user.displayName,
    avatar:req.user.avatar||"",
    text:body,
    reply,
    time:new Date().toISOString()
  };
  messages.push(m);
  messages=messages.slice(-500);
  write(MESSAGES,messages);
  io.emit("message:new",m);
  res.status(201).json({ok:true,message:m});
});

app.delete("/api/messages/:id",auth,(req,res)=>{
  const i=messages.findIndex(m=>m.id===req.params.id);
  if(i<0)return res.status(404).json({error:"メッセージが見つかりません"});
  if(messages[i].userId!==req.user.id)return res.status(403).json({error:"自分のメッセージだけ削除できます"});
  messages.splice(i,1);
  write(MESSAGES,messages);
  io.emit("message:delete",req.params.id);
  res.json({ok:true});
});

io.on("connection",socket=>{
  socket.on("join",userId=>{
    const u=users.find(x=>x.id===userId);
    if(u)socket.data.userId=u.id;
    io.emit("online",io.engine.clientsCount);
  });
  socket.on("typing",v=>{
    socket.broadcast.emit("typing",{name:socket.data.userName||"ユーザー",value:!!v});
  });
  socket.on("disconnect",()=>io.emit("online",io.engine.clientsCount));
});

server.listen(PORT,"0.0.0.0",()=>console.log(`Server listening on ${PORT}`));