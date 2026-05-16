// src/core/photo-service.js — 照片 CRUD 操作
import { supabase } from './supabase.js';

const PHOTOS_PER_PAGE = 20;

export async function loadPhotos(page, categoryId, favoritesOnly) {
    var query = supabase.from('photos').select('*', { count: 'exact' });
    if (categoryId && categoryId !== 'all') {
        query = query.eq('category_id', categoryId);
    }
    if (favoritesOnly) {
        query = query.eq('is_favorite', true);
    }
    var from = (page - 1) * PHOTOS_PER_PAGE;
    var to = from + PHOTOS_PER_PAGE - 1;
    var { data, count, error } = await query
        .order('taken_at', { ascending: false })
        .range(from, to);
    if (error) { console.error('loadPhotos:', error.message); return { photos: [], total: 0, totalPages: 0 }; }
    return { photos: data, total: count, totalPages: Math.ceil(count / PHOTOS_PER_PAGE) };
}

export async function toggleFavorite(photoId, currentState) {
    var { error } = await supabase.from('photos')
        .update({ is_favorite: !currentState })
        .eq('id', photoId);
    return !error;
}

export async function deletePhoto(id, storagePath) {
    if (storagePath) {
        var filename = storagePath.replace(/^.+\/object\/public\/photo\//, '');
        if (filename) {
            await supabase.storage.from('photo').remove([filename]);
        }
    }
    var { error } = await supabase.from('photo_categories').delete().eq('photo_id', id);
    if (error) console.error('deletePhoto cat:', error.message);
    var { error: e2 } = await supabase.from('photos').delete().eq('id', id);
    return !e2;
}

export async function updatePhoto(id, updates) {
    var { error } = await supabase.from('photos').update(updates).eq('id', id);
    return !error;
}

export async function loadPhotoCategories(photoId) {
    var { data, error } = await supabase.from('photo_categories')
        .select('category_id').eq('photo_id', photoId);
    if (error) return [];
    return data.map(function (r) { return r.category_id; });
}

export async function loadAllPhotoCategories(photoIds) {
    if (!photoIds || photoIds.length === 0) return {};
    var { data, error } = await supabase.from('photo_categories')
        .select('photo_id, category_id').in('photo_id', photoIds);
    if (error) return {};
    var map = {};
    data.forEach(function (r) {
        if (!map[r.photo_id]) map[r.photo_id] = [];
        map[r.photo_id].push(r.category_id);
    });
    return map;
}

export async function batchDeletePhotos(photoIds) {
    var { data: photos } = await supabase.from('photos').select('id, storage_path').in('id', photoIds);
    if (photos) {
        for (var i = 0; i < photos.length; i++) {
            if (photos[i].storage_path) {
                var filename = photos[i].storage_path.replace(/^.+\/object\/public\/photo\//, '');
                if (filename) await supabase.storage.from('photo').remove([filename]);
            }
        }
    }
    await supabase.from('photo_categories').delete().in('photo_id', photoIds);
    var { error } = await supabase.from('photos').delete().in('id', photoIds);
    return !error;
}

export { PHOTOS_PER_PAGE };
