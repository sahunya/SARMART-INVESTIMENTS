(()=>{
  const key='sarmart-appearance-v1';
  const read=()=>{try{return JSON.parse(localStorage.getItem(key)||'{}')}catch{return{}}};
  const set=()=>document.body.setAttribute('data-primary-colour',read().primary==='red'?'red':'green');
  const style=document.createElement('style');
  style.textContent=`body[data-primary-colour="red"]{--teal:#b62f2f;--teal-dark:#8f2020}body[data-primary-colour="red"] .sidebar,body[data-primary-colour="red"] .login-screen{background:#8f2020}body[data-primary-colour="red"] .primary-btn,body[data-primary-colour="red"] #dashboard .summary-card.green,body[data-primary-colour="red"] #dashboard .summary-card.dark{background:#b62f2f!important}body[data-primary-colour="red"] .eyebrow,body[data-primary-colour="red"] .amount.receivable,body[data-primary-colour="red"] .summary-card.white{color:#b62f2f!important}body[data-primary-colour="red"] input:focus,body[data-primary-colour="red"] textarea:focus{border-color:#b62f2f;box-shadow:0 0 0 3px #b62f2f26}`;
  document.head.append(style);set();
  const form=document.querySelector('#appearance-form'),before=document.querySelector('#appearance-background')?.closest('label');
  if(!form||!before)return;
  const field=document.createElement('label');
  field.innerHTML='Primary colour<select id="appearance-primary"><option value="green">SARMART green</option><option value="red">Red</option></select>';
  before.before(field);
  document.querySelector('#appearance-settings')?.addEventListener('click',()=>{document.querySelector('#appearance-primary').value=read().primary==='red'?'red':'green'});
  form.addEventListener('submit',()=>setTimeout(()=>{const settings=read();settings.primary=document.querySelector('#appearance-primary').value;localStorage.setItem(key,JSON.stringify(settings));set()},0));
})();

/* Account picture in the opened profile. */
(()=>{const addPicture=()=>{const avatar=document.querySelector('#account-profile-dialog .profile-avatar');if(avatar)avatar.innerHTML='<img src="icon-192.png" alt="SARMART logo">';};document.querySelector('#drawer-profile')?.addEventListener('click',()=>setTimeout(addPicture,0));const style=document.createElement('style');style.textContent='.profile-avatar{overflow:hidden;background:#fff!important;box-shadow:0 2px 9px #173b3026}.profile-avatar img{width:100%;height:100%;object-fit:contain;display:block}';document.head.append(style);})();

/* Administrator profile picture: stored only on this device. */
(()=>{const photoKey='sarmart-admin-profile-photo-v1',fallback='icon-192.png',read=()=>localStorage.getItem(photoKey)||fallback,render=()=>{const dialog=document.querySelector('#account-profile-dialog'),avatar=dialog?.querySelector('.profile-avatar');if(!dialog||!avatar)return;avatar.innerHTML=`<img src="${read()}" alt="Administrator picture">`;let chooser=dialog.querySelector('.profile-picture-choice');if(!chooser){chooser=document.createElement('label');chooser.className='profile-picture-choice';chooser.innerHTML='📷 Change picture<input type="file" accept="image/*" capture="user">';dialog.querySelector('.profile-email')?.after(chooser);}};document.querySelector('#drawer-profile')?.addEventListener('click',()=>setTimeout(render,30));document.addEventListener('change',event=>{const file=event.target.closest('.profile-picture-choice input')?.files?.[0];if(!file)return;if(!file.type.startsWith('image/'))return alert('Please choose a picture file.');if(file.size>900000)return alert('Choose a picture smaller than 900 KB.');const reader=new FileReader();reader.onload=()=>{try{localStorage.setItem(photoKey,String(reader.result));render();}catch{alert('This picture is too large. Please choose a smaller one.')}};reader.readAsDataURL(file);});const style=document.createElement('style');style.textContent='.profile-picture-choice{display:inline-flex!important;align-items:center;gap:6px;margin:-8px auto 16px!important;padding:7px 10px;border-radius:8px;background:#eef7ee;color:#176b29;font-size:12px;font-weight:800;cursor:pointer}.profile-picture-choice input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}';document.head.append(style);})();
