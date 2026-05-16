// src/desktop/views/upload.js — 照片上传与压缩
import { supabase } from '../../core/supabase.js';
import * as Main from '../main.js';

export async function handleUpload(e) {
    e.preventDefault()

    const fileInput = document.getElementById('photoInput')
    const files = fileInput.files

    if (files.length === 0) {
        alert('请选择照片')
        return
    }

    const namePrefix = document.getElementById('photoName').value.trim()
    const description = document.getElementById('photoDesc').value.trim()
    const categoryId = window.getSelectedUploadCategoryId()
    const locationName = (document.getElementById('photoLocationName')?.value || '').trim() || null
    const latitude = parseFloat(document.getElementById('photoLatitude')?.value) || null
    const longitude = parseFloat(document.getElementById('photoLongitude')?.value) || null

    const progressContainer = document.getElementById('uploadProgress')
    const progressFill = document.getElementById('progressFill')
    const progressText = document.getElementById('progressText')
    const btn = e.target.querySelector('button[type="submit"]')

    progressContainer.style.display = 'flex'
    btn.disabled = true
    btn.textContent = '上传中...'

    let successCount = 0
    let failCount = 0

    for (let i = 0; i < files.length; i++) {
        const file = files[i]

        // 文件类型校验
        const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'];
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
            alert('仅支持 JPG/PNG/GIF/WebP/HEIC 格式图片');
            failCount++;
            continue;
        }

        const fileName = namePrefix ? `${namePrefix}_${i + 1}` : file.name

        try {
            // 压缩超过1.5MB的图片
            let fileToUpload = file
            if (file.size > 1.5 * 1024 * 1024) {
                fileToUpload = await compressImage(file, 1.5)
            }

            const fileExtension = fileToUpload.name.split('.').pop()
            const uniqueName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`

            const { error: uploadError } = await supabase.storage
                .from('photo')
                .upload(uniqueName, fileToUpload, {
                    cacheControl: '3600',
                    upsert: false
                })

            if (uploadError) throw uploadError

            const { data: photoData, error: insertError } = await supabase
                .from('photos')
                .insert([{
                    name: fileName,
                    description,
                    storage_path: uniqueName,
                    original_name: file.name,
                    size: fileToUpload.size,
                    is_favorite: false,
                    latitude,
                    longitude,
                    location_name: locationName
                }])
                .select()
                .single()

            if (insertError) throw insertError

            // 如果选择了分类，添加关联
            if (categoryId) {
                await supabase
                    .from('photo_categories')
                    .insert([{ photo_id: photoData.id, category_id: categoryId }])
            }

            successCount++
        } catch (err) {
            console.error('上传失败:', file.name, err)
            failCount++
        }

        const progress = Math.round(((i + 1) / files.length) * 100)
        progressFill.style.width = `${progress}%`
        progressText.textContent = `${progress}%`
    }

    progressContainer.style.display = 'none'
    progressFill.style.width = '0%'
    btn.disabled = false
    btn.textContent = '上传'

    fileInput.value = ''
    document.getElementById('photoName').value = ''
    document.getElementById('photoDesc').value = ''
    const locNameEl = document.getElementById('photoLocationName')
    const latEl = document.getElementById('photoLatitude')
    const lngEl = document.getElementById('photoLongitude')
    if (locNameEl) locNameEl.value = ''
    if (latEl) latEl.value = ''
    if (lngEl) lngEl.value = ''
    window.renderUploadCategoryCascade()

    await window.loadPhotos()
    await window.loadCategories()

    if (failCount === 0) {
        alert(`上传成功！${successCount}张照片已上传`)
    } else {
        alert(`上传完成：${successCount}张成功，${failCount}张失败`)
    }
}

// 压缩图片到目标大小（单位MB）
export async function compressImage(file, maxSizeMB) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        const maxBytes = maxSizeMB * 1024 * 1024

        img.onload = () => {
            let quality = 0.7
            let width = img.width
            let height = img.height

            const tryCompress = () => {
                canvas.width = width
                canvas.height = height
                ctx.drawImage(img, 0, 0, width, height)

                canvas.toBlob(
                    (blob) => {
                        if (!blob || blob.size <= maxBytes || quality <= 0.05) {
                            resolve(blob && blob.size <= file.size ? new File([blob], file.name, { type: 'image/jpeg' }) : file)
                            return
                        }
                        if (quality > 0.1) {
                            quality -= 0.15
                        } else if (width > 400) {
                            width = Math.round(width * 0.7)
                            height = Math.round(height * 0.7)
                            quality = 0.5
                        } else {
                            resolve(file)
                            return
                        }
                        tryCompress()
                    },
                    'image/jpeg',
                    quality
                )
            }

            tryCompress()
        }

        img.src = URL.createObjectURL(file)
    })
}

// 挂载到 window 以兼容 HTML onclick 属性
window.handleUpload = handleUpload;
window.compressImage = compressImage;
