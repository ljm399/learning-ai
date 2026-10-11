<template>
  <span class="a2-text" :class="sizeClass" :style="textStyle">
    {{ content }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  content: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'medium'
  },
  color: {
    type: String,
    default: '#333333'
  }
})

const sizeClass = computed(() => `a2-text--${props.size}`)

const textStyle = computed(() => ({
  color: props.color
}))
</script>

<style scoped>
.a2-text {
  line-height: 1.6;
  word-wrap: break-word;
}

.a2-text--small {
  font-size: 12px;
}

.a2-text--medium {
  font-size: 14px;
}

.a2-text--large {
  font-size: 16px;
}
</style>
