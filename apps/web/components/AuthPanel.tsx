'use client';

import {FormEvent,useEffect,useMemo,useState} from 'react';
import {useAuthStore} from '../lib/auth-store';
import {browserSupabase} from '../lib/supabase-browser';

const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPanel(){
  const{user,setAuth}=useAuthStore();
  const[email,setEmail]=useState('');
  const[password,setPassword]=useState('');
  const[message,setMessage]=useState('');
  const[busy,setBusy]=useState<'signin'|'signup'|null>(null);

  useEffect(()=>{
    const supabase=browserSupabase();
    void supabase.auth.getSession().then(({data})=>{
      const u=data.session?.user;
      setAuth(u?.email?{id:u.id,email:u.email}:undefined);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      const u=session?.user;
      setAuth(u?.email?{id:u.id,email:u.email}:undefined);
    });
    return()=>subscription.unsubscribe();
  },[setAuth]);

  const validation=useMemo(()=>{
    if(!email.trim())return 'Nhập email.';
    if(!EMAIL_RE.test(email.trim()))return 'Email không hợp lệ.';
    if(password.length<8)return 'Mật khẩu cần ít nhất 8 ký tự.';
    return '';
  },[email,password]);

  const signIn=async()=>{
    if(validation){setMessage(validation);return;}
    setBusy('signin');setMessage('');
    const{error}=await browserSupabase().auth.signInWithPassword({email:email.trim(),password});
    if(error)setMessage(error.message);
    setBusy(null);
  };

  const signUp=async()=>{
    if(validation){setMessage(validation);return;}
    setBusy('signup');setMessage('');
    const{data,error}=await browserSupabase().auth.signUp({email:email.trim(),password});
    if(error)setMessage(error.message);
    else if(data.session)setMessage('Tạo tài khoản thành công và đã đăng nhập.');
    else setMessage('Tạo tài khoản thành công. Kiểm tra email để xác nhận tài khoản.');
    setBusy(null);
  };

  const submit=(event:FormEvent)=>{event.preventDefault();void signIn();};

  if(user)return <div className="auth-panel auth-signed-in"><span>{user.email}</span><button type="button" onClick={()=>void browserSupabase().auth.signOut()}>Đăng xuất</button></div>;

  return <form className="auth-panel" onSubmit={submit}>
    <input aria-label="Email" autoComplete="email" placeholder="Email" value={email} onChange={event=>setEmail(event.target.value)}/>
    <input aria-label="Password" autoComplete="current-password" placeholder="Mật khẩu (tối thiểu 8 ký tự)" type="password" value={password} onChange={event=>setPassword(event.target.value)}/>
    <button type="submit" disabled={Boolean(busy)}>{busy==='signin'?'Đang đăng nhập…':'Đăng nhập'}</button>
    <button type="button" disabled={Boolean(busy)} onClick={()=>void signUp()}>{busy==='signup'?'Đang tạo…':'Đăng ký'}</button>
    {message&&<span className="auth-message" role="status">{message}</span>}
  </form>;
}
