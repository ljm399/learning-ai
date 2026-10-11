<script setup>
import { computed } from "vue"
import { VueMarkdown } from "@crazydos/vue-markdown"
import remarkGfm from "remark-gfm"
import hidhlightPlugins from "rehype-highlight"
import CardTep from "./CardTep.vue"

const props = defineProps(["content"])

const emit = defineEmits(['userSend'])

const isArray = computed(() => Array.isArray(props.content))

const textContent = computed(() => {
    if (!isArray.value) return props.content
    return props.content
        .filter(item => item.type === "text")
        .map(item => item.text)
        .join("\n")
})

const images = computed(() => {
    if (!isArray.value) return []
    return props.content
        .filter(item => item.type === "image_url" && item.image_url?.url)
        .map(item => item.image_url.url)
})

//兼容没有用```json开头的json
function extractInlineCards(text) {
    const segments = []
    let currentIndex = 0
    const cardStartRegex = /\{\s*"type"\s*:\s*"card"/g

    while (currentIndex < text.length) {
        cardStartRegex.lastIndex = currentIndex
        const startMatch = cardStartRegex.exec(text)

        if (!startMatch) {
            const remaining = text.slice(currentIndex).trim()
            if (remaining) {
                segments.push({ type: "text", content: remaining })
            }
            break
        }

        const cardIndex = startMatch.index

        if (cardIndex > currentIndex) {
            const beforeText = text.slice(currentIndex, cardIndex).trim()
            if (beforeText) {
                segments.push({ type: "text", content: beforeText })
            }
        }

        let parsed = null
        let endIndex = -1
        for (let i = cardIndex + 1; i <= text.length; i++) {
            try {
                const candidate = text.slice(cardIndex, i)
                const obj = JSON.parse(candidate)
                if (obj.type === "card") {
                    parsed = obj
                    endIndex = i
                    break
                }
            } catch {
                // 还不是合法 JSON，继续扩展
            }
        }

        if (parsed && endIndex !== -1) {
            segments.push({ type: "card", data: parsed })
            currentIndex = endIndex
        } else {
            const nextMatch = cardStartRegex.exec(text)
            const fallbackEnd = nextMatch ? nextMatch.index : text.length
            const fallbackText = text.slice(cardIndex, fallbackEnd).trim()
            if (fallbackText) {
                segments.push({ type: "text", content: fallbackText })
            }
            currentIndex = fallbackEnd
        }
    }

    return segments
}

function handleUserSend(text) {
    emit('userSend', text)
}

const contentSegments = computed(() => {
    const text = textContent.value
    if (!text) return []

    const segments = []
    const jsonBlockRegex = /```json\s*([\s\S]*?)\s*```/g
    let lastIndex = 0
    let match



    while ((match = jsonBlockRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
            const plainText = text.slice(lastIndex, match.index).trim()
            if (plainText) {
                segments.push(...extractInlineCards(plainText))
            }
        }

        const jsonStr = match[1].trim()
        try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.type === "card") {
                segments.push({ type: "card", data: parsed })
            } else {
                segments.push({ type: "text", content: match[0] })
            }
        } catch {
            segments.push({ type: "text", content: match[0] })
        }

        lastIndex = jsonBlockRegex.lastIndex
    }

    if (lastIndex < text.length) {
        const plainText = text.slice(lastIndex).trim()
        if (plainText) {
            segments.push(...extractInlineCards(plainText))
        }
    }

    return segments
})



</script>
<template>
    <div>
        <img v-for="(url, idx) in images" :key="idx" :src="url" alt="" style="max-width: 400px; max-height: 200px;" />
        <template v-for="(segment, idx) in contentSegments" :key="idx">
            <CardTep v-if="segment.type === 'card'" :data="segment.data" @userSend="handleUserSend" />
            <VueMarkdown v-else :custom-attrs="{
                a: { class: 'mardown-a' },
                img: { style: 'max-width: 500px;' }
            }" :remark-plugins="[remarkGfm]" :rehype-plugins="[hidhlightPlugins]" :markdown="segment.content">
                <template #input="{ ...props }">
                    <span v-if="props.type === 'checkbox' && props.checked">
                        ✅
                    </span>
                    <span v-if="props.type === 'checkbox' && !props.checked">
                        [ ]
                    </span>
                </template>
                <template #li="{ children, ...props }">
                    <div class="my-li">
                        <Component :is="children"></Component>
                    </div>
                </template>
            </VueMarkdown>
        </template>
    </div>
</template>
<style></style>