// src/core/storage-service.js — 文件上传到 Supabase Storage
import { supabase } from './supabase.js';

export async function uploadFile(file, path) {
    var { data, error } = await supabase.storage.from('photo').upload(path, file, {
        cacheControl: '3600',
        upsert: false
    });
    if (error) { console.error('uploadFile:', error.message); return null; }
    return data;
}

export function getPublicUrl(storagePath) {
    var baseUrl = (window.__APP_CONFIG__?.SUPABASE_STORAGE_URL || '/storage/v1/object/public/photo/');
    return baseUrl + storagePath;
}
