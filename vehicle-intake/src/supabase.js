import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const BUCKET_NAME = 'vehicle-intake-images'
const CONFIG_PLACEHOLDERS = new Set([
    '',
    'YOUR_PROJECT_URL',
    'YOUR_ANON_KEY',
    'YOUR_ANON_KEY_HERE'
]);

function assertSupabaseConfigured() {
    if (CONFIG_PLACEHOLDERS.has(SUPABASE_URL) || CONFIG_PLACEHOLDERS.has(SUPABASE_ANON_KEY)) {
        throw new Error('กรุณาตั้งค่า SUPABASE_URL และ SUPABASE_ANON_KEY ในไฟล์ src/config.js ก่อนใช้งาน');
    }
}

function sanitizeSearchTerm(value) {
    return String(value || '')
        .trim()
        .replace(/[,%()*]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}

/**
 * Upload an image to Supabase Storage
 * @param {File} file 
 * @param {string} path 
 * @returns {Promise<string>} Public URL
 */
export async function uploadImage(file, path) {
    assertSupabaseConfigured();
    const safePath = String(path || 'unknown').replace(/[^\p{L}\p{N}_-]+/gu, '_');
    const safeName = String(file.name || 'image.jpg').replace(/[^\p{L}\p{N}_.-]+/gu, '_');
    const fileName = `${safePath}/${crypto.randomUUID()}_${safeName}`;
    const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file);

    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(data.path);

    return publicUrl;
}

/**
 * Delete an image from Supabase Storage
 * @param {string} url 
 */
export async function deleteImage(url) {
    assertSupabaseConfigured();
    try {
        const path = url.split(`${BUCKET_NAME}/`)[1];
        if (!path) return;
        await supabase.storage.from(BUCKET_NAME).remove([path]);
    } catch (err) {
        console.error('Error deleting image:', err);
    }
}

/**
 * Create a new intake form record
 * @param {Object} formData 
 */
export async function createIntakeForm(formData) {
    assertSupabaseConfigured();
    const { data, error } = await supabase
        .from('vehicle_intake_forms')
        .insert([formData])
        .select();

    if (error) throw error;
    return data[0];
}

/**
 * Search intake forms
 */
export async function searchIntakeForms({ query, dateFrom, dateTo }) {
    assertSupabaseConfigured();
    let rpcQuery = supabase.from('vehicle_intake_forms').select('*').order('created_at', { ascending: false });
    const safeQuery = sanitizeSearchTerm(query);

    if (safeQuery) {
        rpcQuery = rpcQuery.or(`license_plate.ilike.%${safeQuery}%,customer_name.ilike.%${safeQuery}%,customer_phone.ilike.%${safeQuery}%`);
    }

    if (dateFrom) {
        rpcQuery = rpcQuery.gte('intake_date', dateFrom);
    }

    if (dateTo) {
        rpcQuery = rpcQuery.lte('intake_date', dateTo);
    }

    const { data, error } = await rpcQuery;
    if (error) throw error;
    return data;
}

/**
 * Get single record by ID
 */
export async function getIntakeFormById(id) {
    assertSupabaseConfigured();
    const { data, error } = await supabase
        .from('vehicle_intake_forms')
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    return data;
}

/**
 * Delete record and its images
 */
export async function deleteIntakeForm(id) {
    assertSupabaseConfigured();
    const record = await getIntakeFormById(id);
    
    // Delete images from storage
    if (record.image_urls && record.image_urls.length > 0) {
        for (const url of record.image_urls) {
            await deleteImage(url);
        }
    }

    // Delete record
    const { error } = await supabase
        .from('vehicle_intake_forms')
        .delete()
        .eq('id', id);

    if (error) throw error;
}

/**
 * Update record
 */
export async function updateIntakeForm(id, formData) {
    assertSupabaseConfigured();
    const { data, error } = await supabase
        .from('vehicle_intake_forms')
        .update(formData)
        .eq('id', id)
        .select();

    if (error) throw error;
    return data[0];
}
