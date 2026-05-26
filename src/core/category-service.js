// src/core/category-service.js — 分类 CRUD + 树操作
import { supabase } from './supabase.js';

var categories = [];

export function getCategories() { return categories; }

export async function loadCategories() {
    var { data, error } = await supabase.from('categories').select('*').order('created_at', { ascending: false });
    if (error) { console.error('loadCategories:', error.message); return []; }
    categories = data || [];
    return categories;
}

export function getCategoryAndChildrenIds(categoryId) {
    var strId = String(categoryId);
    var ids = [strId];
    categories.forEach(function (c) {
        if (String(c.parent_id) === strId) {
            ids.push.apply(ids, getCategoryAndChildrenIds(c.id));
        }
    });
    return ids;
}

export function getCategoryPath(categoryId, field) {
    var path = [];
    var currentId = categoryId;
    var visited = new Set();
    field = field || 'id';
    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        var cat = categories.find(function (c) { return c.id === currentId; });
        if (!cat) break;
        path.unshift(cat[field]);
        currentId = cat.parent_id;
    }
    return path;
}

export async function createCategory(name, parentId) {
    var { data, error } = await supabase.from('categories')
        .insert({ name: name, parent_id: parentId || null })
        .select().single();
    if (error) { console.error('createCategory:', error.message); return null; }
    categories.push(data);
    return data;
}

export async function deleteCategory(id) {
    var { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) { console.error('deleteCategory:', error.message); return false; }
    categories = categories.filter(function (c) { return c.id !== id; });
    return true;
}

export async function updateCategory(id, updates) {
    var { error } = await supabase.from('categories').update(updates).eq('id', id);
    if (error) return false;
    var idx = categories.findIndex(function (c) { return c.id === id; });
    if (idx >= 0) Object.assign(categories[idx], updates);
    return true;
}

export function getMarkedCategories() {
    return new Set((JSON.parse(localStorage.getItem('markedCategories') || '[]')).map(String));
}

export function saveMarkedCategories(markedSet) {
    localStorage.setItem('markedCategories', JSON.stringify(Array.from(markedSet)));
}
