import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

// ponytail: ทุก call ยิงผ่าน internal-proxy (service_role ฝั่ง server + staff key)
// แทน SDK+anon key ตรงๆ เพราะ bucket/table นี้ปิด anon เข้าถึงทั้งหมดแล้ว

const BUCKET_NAME = 'vehicle-intake-images'
const imageBlobCache = new Map()

async function fetchWithProxy(endpoint, options = {}) {
    let staffKey = localStorage.getItem('kmo_staff_key');
    if (!staffKey) {
        staffKey = prompt('กรุณากรอกรหัสผ่านร้าน KMO เพื่อบันทึกใบรับรถ:');
        if (staffKey) localStorage.setItem('kmo_staff_key', staffKey);
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/internal-proxy/${endpoint}`, {
        ...options,
        headers: {
            ...options.headers,
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'x-staff-key': staffKey || '',
        },
    });

    if (res.status === 401) {
        localStorage.removeItem('kmo_staff_key');
        alert('รหัสผ่านร้านไม่ถูกต้อง กรุณารีเฟรชเพื่อเข้าสู่ระบบใหม่');
        throw new Error('Unauthorized');
    }
    return res;
}

function sanitizeSearchTerm(value) {
    return String(value || '')
        .trim()
        .replace(/[,%()*]/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 80);
}

function sanitizeStorageSegment(value, fallback) {
    const sanitized = String(value || '')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_.-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80);

    return sanitized || fallback;
}

/**
 * Upload an image to Supabase Storage via internal-proxy
 * @param {File} file
 * @param {string} path
 * @returns {Promise<string>} Storage path (not a directly-fetchable public URL anymore — bucket is private)
 */
export async function uploadImage(file, path) {
    const safePath = sanitizeStorageSegment(path, 'vehicle');
    const safeName = sanitizeStorageSegment(file.name || 'image.jpg', 'image.jpg');
    const fileName = `${safePath}/${crypto.randomUUID()}_${safeName}`;

    const res = await fetchWithProxy(`storage/v1/object/${BUCKET_NAME}/${fileName}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`อัปโหลดรูปภาพล้มเหลว: ${errText}`);
    }

    // เก็บเป็น "public URL แบบเดิม" ไว้ในฟิลด์ image_urls เพื่อความเข้ากันได้กับ record เก่า
    // (bucket เป็น private แล้ว URL นี้ดึงตรงไม่ได้ ต้องผ่าน resolveImageSrc เท่านั้น)
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${fileName}`;
}

/**
 * Delete an image from Supabase Storage via internal-proxy
 * @param {string} url
 */
export async function deleteImage(url) {
    const path = getStoragePathFromUrl(url);
    if (!path) return;

    const res = await fetchWithProxy(`storage/v1/object/${BUCKET_NAME}/${path}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const errText = await res.text();
        throw new Error(`ลบรูปภาพล้มเหลว: ${errText}`);
    }
    imageBlobCache.delete(url);
}

/**
 * Resolve a stored image URL into a browser-usable src (blob: URL).
 * Needed because the bucket is private now — a plain <img src="..."> can't
 * send the staff-key header, so we fetch the bytes ourselves via the proxy.
 * Cached per URL so re-rendering the same list doesn't re-fetch.
 * @param {string} url
 * @returns {Promise<string>} blob: URL, or a placeholder on failure
 */
export async function resolveImageSrc(url) {
    if (!url) return '';
    if (imageBlobCache.has(url)) return imageBlobCache.get(url);

    const path = getStoragePathFromUrl(url);
    if (!path) return url;

    try {
        const res = await fetchWithProxy(`storage/v1/object/${BUCKET_NAME}/${path}`, {
            method: 'GET',
        });
        if (!res.ok) throw new Error(`load failed (${res.status})`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        imageBlobCache.set(url, blobUrl);
        return blobUrl;
    } catch (err) {
        console.error('resolveImageSrc failed:', url, err);
        return '';
    }
}

function getStoragePathFromUrl(url) {
    try {
        const parsed = new URL(url);
        const marker = `/object/public/${BUCKET_NAME}/`;
        const markerIndex = parsed.pathname.indexOf(marker);
        if (markerIndex === -1) return null;
        return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    } catch (err) {
        const path = String(url || '').split(`${BUCKET_NAME}/`)[1];
        return path ? decodeURIComponent(path) : null;
    }
}

/**
 * Create a new intake form record
 */
export async function createIntakeForm(formData) {
    const res = await fetchWithProxy('vehicle_intake_forms', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(formData),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'บันทึกข้อมูลล้มเหลว');
    }
    const data = await res.json();
    return data[0];
}

/**
 * Search intake forms
 */
export async function searchIntakeForms({ query, dateFrom, dateTo }) {
    const params = new URLSearchParams();
    params.append('select', '*');
    params.append('order', 'created_at.desc');

    const safeQuery = sanitizeSearchTerm(query);
    if (safeQuery) {
        params.append('or', `license_plate.ilike.%${safeQuery}%,customer_name.ilike.%${safeQuery}%,customer_phone.ilike.%${safeQuery}%`);
    }
    if (dateFrom) {
        params.append('intake_date', `gte.${dateFrom}`);
    }
    if (dateTo) {
        params.append('intake_date', `lte.${dateTo}`);
    }

    const res = await fetchWithProxy(`vehicle_intake_forms?${params.toString()}`, {
        method: 'GET',
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'ดึงประวัติการรับรถล้มเหลว');
    }
    return res.json();
}

/**
 * Get single record by ID
 */
export async function getIntakeFormById(id) {
    const res = await fetchWithProxy(`vehicle_intake_forms?id=eq.${id}&select=*`, {
        method: 'GET',
        headers: { 'Accept': 'application/vnd.pgrst.object+json' },
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'ดึงรายละเอียดใบรับรถล้มเหลว');
    }
    return res.json();
}

/**
 * Delete record and its images
 */
export async function deleteIntakeForm(id) {
    const record = await getIntakeFormById(id);

    if (record.image_urls && record.image_urls.length > 0) {
        for (const url of record.image_urls) {
            await deleteImage(url);
        }
    }

    const res = await fetchWithProxy(`vehicle_intake_forms?id=eq.${id}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'ลบใบรับรถล้มเหลว');
    }
}

/**
 * Update record
 */
export async function updateIntakeForm(id, formData) {
    const res = await fetchWithProxy(`vehicle_intake_forms?id=eq.${id}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
        },
        body: JSON.stringify(formData),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'อัปเดตข้อมูลล้มเหลว');
    }
    const data = await res.json();
    return data[0];
}
