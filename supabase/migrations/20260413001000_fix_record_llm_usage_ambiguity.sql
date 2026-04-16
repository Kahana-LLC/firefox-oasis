drop function if exists public.record_llm_usage(
  uuid,
  text,
  bigint,
  bigint,
  boolean,
  text,
  text,
  timestamp without time zone
);

create or replace function public.record_llm_usage(
  p_user_id uuid,
  p_model_used text,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_success boolean,
  p_command_type text default null,
  p_user_intent text default null,
  p_usage_timestamp timestamp without time zone default current_timestamp
)
returns table (
  result_usage_id uuid,
  result_usage_date date,
  result_total_tokens bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usage_id uuid := gen_random_uuid();
  v_usage_date date := p_usage_timestamp::date;
  v_input_tokens bigint := coalesce(p_input_tokens, 0);
  v_output_tokens bigint := coalesce(p_output_tokens, 0);
  v_total_tokens bigint := v_input_tokens + v_output_tokens;
begin
  insert into public.llm_usage (
    usage_id,
    user_id,
    "timestamp",
    tokens_used,
    usage_count,
    model_used,
    success,
    input_tokens,
    output_tokens,
    total_tokens,
    usage_date,
    command_type,
    user_intent
  )
  values (
    v_usage_id,
    p_user_id,
    p_usage_timestamp,
    v_total_tokens,
    1,
    p_model_used,
    p_success,
    nullif(v_input_tokens, 0),
    nullif(v_output_tokens, 0),
    v_total_tokens,
    v_usage_date,
    p_command_type,
    p_user_intent
  );

  insert into public.llm_daily_usage (
    user_id,
    usage_date,
    input_tokens,
    output_tokens,
    total_tokens,
    request_count,
    updated_at
  )
  values (
    p_user_id,
    v_usage_date,
    v_input_tokens,
    v_output_tokens,
    v_total_tokens,
    1,
    current_timestamp
  )
  on conflict (user_id, usage_date) do update
    set input_tokens = public.llm_daily_usage.input_tokens + excluded.input_tokens,
        output_tokens = public.llm_daily_usage.output_tokens + excluded.output_tokens,
        total_tokens = public.llm_daily_usage.total_tokens + excluded.total_tokens,
        request_count = public.llm_daily_usage.request_count + excluded.request_count,
        updated_at = excluded.updated_at;

  result_usage_id := v_usage_id;
  result_usage_date := v_usage_date;
  result_total_tokens := v_total_tokens;
  return next;
end;
$$;

revoke all on function public.record_llm_usage(
  uuid,
  text,
  bigint,
  bigint,
  boolean,
  text,
  text,
  timestamp without time zone
) from public;

grant execute on function public.record_llm_usage(
  uuid,
  text,
  bigint,
  bigint,
  boolean,
  text,
  text,
  timestamp without time zone
) to service_role;
