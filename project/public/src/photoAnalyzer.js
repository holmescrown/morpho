// public/src/photoAnalyzer.js - P3: 创造者之眼，多模态照片解析器

/**
 * 处理玩家上传的现实照片：
 * 1. 在 canvas 中预览
 * 2. 将图片编码为 base64 并发送至 /api/analyze-photo
 * 3. 根据 AI 返回的环境语义驱动光照联控与变异触发
 */
export async function handlePhotoUpload(input, callbacks = {}) {
    const file = input.files[0];
    if (!file) return;

    const { onPreview, onAnalyzing, onResult, onError } = callbacks;

    // 1. 预览图片
    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64 = e.target.result;

        // 渲染预览缩略图
        const previewCanvas = document.getElementById('photo-preview');
        if (previewCanvas) {
            previewCanvas.style.display = 'block';
            const ctx = previewCanvas.getContext('2d');
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
                const scale = Math.min(previewCanvas.width / img.width, previewCanvas.height / img.height);
                const x = (previewCanvas.width - img.width * scale) / 2;
                const y = (previewCanvas.height - img.height * scale) / 2;
                ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
            };
            img.src = base64;
        }

        if (onPreview) onPreview();
        if (onAnalyzing) onAnalyzing();

        // 2. 发送至 Worker AI 解析
        try {
            const response = await fetch('/api/analyze-photo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 })
            });

            if (!response.ok) throw new Error(`AI 解析失败: ${response.status}`);

            const result = await response.json();
            if (onResult) onResult(result);

        } catch (err) {
            console.error('照片解析错误:', err);
            if (onError) onError(err);
        }
    };

    reader.readAsDataURL(file);
}
