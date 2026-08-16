import {PrismaClient} from '@prisma/client';
import {createClient} from '@supabase/supabase-js';

function required(name:string){
  const value=process.env[name]?.trim();
  if(!value)throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function main(){
  const url=required('SUPABASE_URL');
  const secret=required('SUPABASE_SECRET_KEY');
  const email=required('DEV_USER_EMAIL').toLowerCase();
  const password=required('DEV_USER_PASSWORD');
  if(password.length<8)throw new Error('DEV_USER_PASSWORD must contain at least 8 characters.');

  const supabase=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const db=new PrismaClient();
  try{
    const listed=await supabase.auth.admin.listUsers({page:1,perPage:1000});
    if(listed.error)throw listed.error;
    let user=listed.data.users.find(item=>item.email?.toLowerCase()===email);
    if(!user){
      const created=await supabase.auth.admin.createUser({email,password,email_confirm:true});
      if(created.error||!created.data.user)throw created.error??new Error('Supabase did not return the created user.');
      user=created.data.user;
      console.log(`Created Supabase Auth user ${email}.`);
    }else{
      const updated=await supabase.auth.admin.updateUserById(user.id,{password,email_confirm:true});
      if(updated.error)throw updated.error;
      console.log(`Supabase Auth user ${email} already existed; password was updated.`);
    }
    await db.user.upsert({where:{id:user.id},update:{email},create:{id:user.id,email}});
    console.log(`Synchronized public User row for ${email} (${user.id}).`);
  }finally{
    await db.$disconnect();
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
