import { tool } from "@langchain/core/tools";
import { z } from "zod";
import "dotenv/config";

async function loadImage(source) {
    if (typeof source !== "string" || !/^https?:\/\//i.test(source)) {
        throw new Error("图片参数必须是公网可访问的 HTTP/HTTPS URL");
    }

    const response = await fetch(source, {
        signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
        throw new Error(`参考图下载失败：HTTP ${response.status}`);
    }

    const image = await response.blob();
    if (!image.type.startsWith("image/")) {
        throw new Error("图片 URL 返回的不是图片内容");
    }

    return image;
}

function extensionForMime(type) {
    return {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp",
        "image/gif": "gif"
    }[type] || "img";
}

export default tool(
    async ({ personImageUrl, productImageUrl }) => {
        try {
            const apiKey = process.env.MICU_API_KEY;
            if (!apiKey) {
                return "试穿图生成失败：请先设置环境变量 MICU_API_KEY";
            }

            const prompt = `将第二张商品服装穿到第一张人物身上，生成一张自然的试穿效果图。要求：
1. 保持人物原有姿态、发型、面部特征不变；
2. 服装款式、颜色、图案与商品图一致；
3. 光影自然，服装贴合人物身形；
4. 背景简洁，突出试穿效果；
5. 只生成一张完整的试穿照片，不要拼接两张参考图。`;

            // 两张输入图都是公网 URL，服务端下载后以 multipart 方式提交给图片接口。
            const [personImage, productImage] = await Promise.all([
                loadImage(personImageUrl),
                loadImage(productImageUrl)
            ]);

            const formData = new FormData();
            formData.append("model", process.env.MICU_MODEL || "gpt-image-2.5-sunburst");
            formData.append("prompt", prompt);
            formData.append("size", "2048x2048");
            formData.append("quality", "low");
            formData.append("response_format", "url");
            formData.append(
                "image[]",
                personImage,
                `person.${extensionForMime(personImage.type)}`
            );
            formData.append(
                "image[]",
                productImage,
                `product.${extensionForMime(productImage.type)}`
            );

            const baseUrl = (process.env.MICU_BASEURL || "https://www.micuapi.ai")
                .replace(/\/+$/, "");

            const response = await fetch(`${baseUrl}/v1/images/edits`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`
                },
                body: formData,
                signal: AbortSignal.timeout(600000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                return `试穿图生成失败：${response.status} ${errorText}`;
            }

            const data = await response.json();
            const imageData = data.data?.[0];

            if (imageData?.url) {
                return `这是生成的试穿图，请以 Markdown 格式的图片展示给前端：${imageData.url}`;
            }
            return "试穿图生成失败：接口没有返回图片 URL，请检查 response_format=url 配置";
        } catch (error) {
            console.error("试穿图生成失败", error);
            return `试穿图生成失败：${error.message}`;
        }
    },
    {
        name: "generate_tryon_image",
        description:
            "根据用户上传的人像照片和商品服装图片，生成虚拟试穿效果图。两个参数都必须是公网可访问的真实 HTTP/HTTPS 图片 URL。",
        schema: z.object({
            personImageUrl: z
                .string()
                .url()
                .describe("用户人像照片的公网 HTTP/HTTPS URL"),
            productImageUrl: z
                .string()
                .url()
                .describe("商品服装图片的公网 HTTP/HTTPS URL")
        })
    }
);


