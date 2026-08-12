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
