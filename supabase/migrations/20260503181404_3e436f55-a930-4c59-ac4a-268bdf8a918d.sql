CREATE OR REPLACE FUNCTION public.get_or_create_referral_code()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _code TEXT;
  _attempts INT := 0;
  _alphabet TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  _i INT;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT code INTO _code FROM public.referral_codes WHERE user_id = _uid;
  IF _code IS NOT NULL THEN
    RETURN _code;
  END IF;

  LOOP
    _attempts := _attempts + 1;
    _code := '';
    FOR _i IN 1..6 LOOP
      _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.referral_codes (user_id, code) VALUES (_uid, _code);
      RETURN _code;
    EXCEPTION WHEN unique_violation THEN
      IF _attempts > 8 THEN
        RAISE EXCEPTION 'Could not generate referral code';
      END IF;
    END;
  END LOOP;
END;
$function$;