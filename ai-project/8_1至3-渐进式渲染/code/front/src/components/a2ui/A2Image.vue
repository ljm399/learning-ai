<template>
  <div class="a2-image-wrapper" :style="wrapperStyle">
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      class="a2-image"
      :class="fitClass"
      :style="imageStyle"
      @load="onLoad"
      @error="onError"
    />
    <div v-else class="a2-image-placeholder">
      <span class="a2-image-placeholder-text">暂无图片</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  src: {
    type: String,
    default: ''
  },
  alt: {
    type: String,
    default: ''
  },
  width: {
    type: [String, Number],
    default: ''
  },
  height: {
    type: [String, Number],
    default: ''
  },
  fit: {
    type: String,
    default: 'cover',
    validator: (val) => ['contain', 'cover', 'fill', 'none', 'scale-down'].includes(val)
  },
  borderRadius: {
    type: [String, Number],
    default: 0
  }
})

const emit = defineEmits(['load', 'error'])

const fitClass = computed(() => `a2-image--${props.fit}`)

const wrapperStyle = computed(() => {
  const style = {}
  if (props.width) {
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  }
  if (props.height) {
    style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  }
  if (props.borderRadius) {
    style.borderRadius = typeof props.borderRadius === 'number' ? `${props.borderRadius}px` : props.borderRadius
  }
  return style
})

const imageStyle = computed(() => ({
  borderRadius: typeof props.borderRadius === 'number' ? `${props.borderRadius}px` : props.borderRadius
}))

const onLoad = (event) => {
  emit('load', event)
}

const onError = (event) => {
  emit('error', event)
}
</script>

<style scoped>
.a2-image-wrapper {
  display: inline-flex;
  overflow: hidden;
  position: relative;
}

.a2-image {
  display: block;
  transition: opacity 0.3s;
}

.a2-image--contain {
  object-fit: contain;
  width: 100%;
  height: 100%;
}

.a2-image--cover {
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.a2-image--fill {
  object-fit: fill;
  width: 100%;
  height: 100%;
}

.a2-image--none {
  object-fit: none;
}

.a2-image--scale-down {
  object-fit: scale-down;
  width: 100%;
  height: 100%;
}

.a2-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-width: 100px;
  min-height: 100px;
  background: #f5f5f5;
  border: 1px dashed #d9d9d9;
}

.a2-image-placeholder-text {
  color: #999;
  font-size: 14px;
}
</style>
