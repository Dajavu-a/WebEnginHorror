create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    coalesce(new.email, ''),
    case
      when new.email_confirmed_at is not null
        and lower(coalesce(new.email, '')) = 'thanaphatsandee@gmail.com'
      then 'admin'
      else 'user'
    end
  )
  on conflict (id) do update
    set email = excluded.email,
        role = excluded.role;
  return new;
end;
$$;

update public.profiles as profile
set email = coalesce(auth_user.email, ''),
    role = case
      when auth_user.email_confirmed_at is not null
        and lower(coalesce(auth_user.email, '')) = 'thanaphatsandee@gmail.com'
      then 'admin'
      else 'user'
    end
from auth.users as auth_user
where profile.id = auth_user.id;
