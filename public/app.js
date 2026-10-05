const $=id=>document.getElementById(id);
let registerMode=false,currentUser=null,replyId=null;
const socket=io();

async function api(url,options={}){
  const opts={credentials:"same-origin",...options};
  opts.headers={"Content-Type":"application/json",...(options.headers||{})};
  const res=await fetch(url,opts);
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||"サーバーエラー");
  return data;
}
function avatar(src,name){
  return src||`https://ui-avatars.com/api/?name=${encodeURIComponent(name||"?")}&background=334155&color=fff`;
}
function showAuth(reg){
  registerMode=reg;
  $("loginTab").classList.toggle("selected",!reg);
  $("registerTab").classList.toggle("selected",reg);
  $("displayWrap").classList.toggle("hidden",!reg);
  $("authButton").textContent=reg?"アカウントを作成":"ログイン";
  $("authMessage").textContent="";
  $("password").value="";
}
function enter(user){
  currentUser=user;
  $("authPage").classList.add("hidden");
  $("chatPage").classList.remove("hidden");
  $("myName").textContent=user.displayName;
  $("myAvatar").src=avatar(user.avatar,user.displayName);
  socket.emit("join",user.id);
}
async function loadMessages(){
  const d=await api("/api/messages");
  $("messages").innerHTML="";
  d.forEach(renderMessage);
  $("messages").scrollTop=$("messages").scrollHeight;
}
function renderMessage(m){
  const row=document.createElement("div");
  row.className="message"+(m.userId===currentUser.id?" mine":"");
  row.dataset.id=m.id;
  const img=document.createElement("img");img.className="avatar";img.src=avatar(m.avatar,m.displayName);
  const b=document.createElement("div");b.className="bubble";
  const meta=document.createElement("div");meta.className="meta";
  meta.textContent=`${m.displayName} (@${m.username}) · ${new Date(m.time).toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit"})}`;
  b.append(meta);
  if(m.reply){const r=document.createElement("div");r.className="reply";r.textContent=`↩ ${m.reply.username}: ${m.reply.text}`;b.append(r)}
  const body=document.createElement("div");body.className="body";body.textContent=m.text;b.append(body);
  const actions=document.createElement("div");actions.className="actions";
  const rp=document.createElement("button");rp.textContent="返信";rp.onclick=()=>startReply(m);actions.append(rp);
  if(m.userId===currentUser.id){const del=document.createElement("button");del.textContent="削除";del.onclick=()=>deleteMessage(m.id);actions.append(del)}
  b.append(actions);row.append(img,b);$("messages").append(row);
}
function startReply(m){replyId=m.id;$("replyBar").innerHTML=`返信: ${escapeHtml(m.displayName)}「${escapeHtml(m.text.slice(0,70))}」 <button id="cancelReply">×</button>`;$("replyBar").classList.remove("hidden");$("cancelReply").onclick=cancelReply;$("messageInput").focus()}
function cancelReply(){replyId=null;$("replyBar").classList.add("hidden")}
function escapeHtml(s){const d=document.createElement("div");d.textContent=s;return d.innerHTML}
async function deleteMessage(id){if(!confirm("このメッセージを削除しますか？"))return;try{await api("/api/messages/"+id,{method:"DELETE"})}catch(e){alert(e.message)}}

$("loginTab").onclick=()=>showAuth(false);
$("registerTab").onclick=()=>showAuth(true);

$("authForm").onsubmit=async e=>{
  e.preventDefault();
  $("authMessage").textContent="処理中...";
  const body={username:$("username").value.trim(),password:$("password").value};
  if(registerMode)body.displayName=$("displayName").value.trim();
  try{
    const d=await api(registerMode?"/api/register":"/api/login",{method:"POST",body:JSON.stringify(body)});
    enter(d.user);
    await loadMessages();
  }catch(err){$("authMessage").textContent=err.message}
};

$("messageForm").onsubmit=async e=>{
  e.preventDefault();
  const input=$("messageInput"),value=input.value.trim();
  if(!value)return;
  try{
    await api("/api/messages",{method:"POST",body:JSON.stringify({text:value,replyTo:replyId})});
    input.value="";cancelReply();
  }catch(err){alert(err.message)}
};
$("messageInput").oninput=()=>socket.emit("typing",!!$("messageInput").value);
socket.on("message:new",m=>{renderMessage(m);$("messages").scrollTop=$("messages").scrollHeight});
socket.on("message:delete",id=>document.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove());
socket.on("online",n=>$("online").textContent=`オンライン: ${n}`);
socket.on("typing",d=>$("typing").textContent=d.value?`${d.name} が入力中...`:"");

$("logoutButton").onclick=async()=>{await api("/api/logout",{method:"POST"});location.reload()};
$("profileButton").onclick=()=>{$("newDisplayName").value=currentUser.displayName;$("preview").src=avatar(currentUser.avatar,currentUser.displayName);$("profileMessage").textContent="";$("profileModal").classList.remove("hidden")};
$("closeProfile").onclick=()=>$("profileModal").classList.add("hidden");
$("avatarFile").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  if(f.size>250000){$("profileMessage").textContent="画像は250KB以下にしてください";return}
  const r=new FileReader();r.onload=()=>{$("preview").src=r.result;$("preview").dataset.image=r.result};r.readAsDataURL(f);
};
$("saveProfile").onclick=async()=>{
  try{
    const d=await api("/api/profile",{method:"PUT",body:JSON.stringify({displayName:$("newDisplayName").value.trim(),avatar:$("preview").dataset.image||currentUser.avatar})});
    currentUser=d.user;$("myName").textContent=currentUser.displayName;$("myAvatar").src=avatar(currentUser.avatar,currentUser.displayName);
    $("profileModal").classList.add("hidden");await loadMessages();
  }catch(e){$("profileMessage").textContent=e.message}
};

showAuth(false);
api("/api/me").then(async d=>{if(d.user){enter(d.user);await loadMessages()}}).catch(()=>{});