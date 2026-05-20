INSERT INTO storage.buckets (id, name, public) VALUES ('professionals', 'professionals', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read professionals" ON storage.objects FOR SELECT USING (bucket_id = 'professionals');
CREATE POLICY "Auth upload professionals" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'professionals');
CREATE POLICY "Auth update professionals" ON storage.objects FOR UPDATE USING (bucket_id = 'professionals');
CREATE POLICY "Auth delete professionals" ON storage.objects FOR DELETE USING (bucket_id = 'professionals');