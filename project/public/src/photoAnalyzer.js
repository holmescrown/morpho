/**
 * photoAnalyzer.js
 * 图像分析模块 —— 负责将用户上传的照片解析为进化指令
 * 通过调用后端 AI 视觉接口，提取照片中的生物形态特征并映射为基因 Patch
 */

/**
 * 处理用户上传的图像文件，提取形态特征，触发基因进化流程
 * @param {File} file - 用户上传的图像文件
 * @returns {Promise<{tags: string[], description: string}>}
 */
export async function handlePhotoUpload(file) {
    if (!file || !file.type.startsWith('image/')) {
        throw new Error('无效的图像文件');
    }

    const logEl = document.getElementById('ai-log');
    if (logEl) logEl.innerHTML = `<span style="color:#aaffee;">📸 正在解析图像形态特征...</span>`;

    // 将文件转为 Base64
    const base64 = await fileToBase64(file);

    try {
        const response = await fetch('/api/analyze-photo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64, mimeType: file.type })
        });

        if (!response.ok) {
            throw new Error(`图像分析 API 返回错误: ${response.status}`);
        }

        const result = await response.json();
        const tags = result.tags || [];
        const description = result.description || '形态特征未知';

        if (logEl) logEl.innerHTML = `<span style="color:#00ff88;">📸 图像解析完成：${description}</span>`;

        // 将标签映射为环境光照调整
        if (window.applyEnvironmentLighting && tags.length > 0) {
            window.applyEnvironmentLighting(tags.join(' '));
        }

        // 触发基因变异仪式
        if (window.submitMutation && description) {
            await window.submitMutation(`根据图像特征进化：${description}`);
        }

        return { tags, description };
    } catch (err) {
        console.warn('[photoAnalyzer] 图像分析失败（后端可能未实现）:', err.message);
        if (logEl) logEl.innerHTML = `<span style="color:#ffaa00;">📸 图像分析模块暂未连接后端，跳过处理。</span>`;
        return { tags: [], description: '' };
    }
}

/**
 * 将 File 对象转换为 Base64 字符串
 * @param {File} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
