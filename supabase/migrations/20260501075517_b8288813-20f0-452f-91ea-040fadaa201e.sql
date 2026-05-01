
REVOKE EXECUTE ON FUNCTION public.verify_pass(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.serve_meal_by_pass(text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_reissue_pass_code(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_qr_pass_code() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.verify_pass(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.serve_meal_by_pass(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reissue_pass_code(uuid) TO authenticated;
