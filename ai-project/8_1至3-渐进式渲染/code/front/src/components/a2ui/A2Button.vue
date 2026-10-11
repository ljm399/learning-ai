<template>
  <button
    class="a2-button"
    :class="styleClass"
    @click="handleClick"
  >
    {{ label }}
  </button>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  label: {
    type: String,
    required: true
  },
  action: {
    type: String,
    default: ''
  },
  style: {
    type: String,
    default: 'default'
  }
})

const emit = defineEmits(['click'])

const styleClass = computed(() => ({
  [`a2-button--${props.style}`]: props.style
}))

const handleClick = () => {
  console.log('a2button');
  
  emit('clickAction', props.action)
}
</script>

<style scoped>
.a2-button {
  padding: 10px 24px;
  border: 1px solid #d9d9d9;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.a2-button--primary {
  background: #1677ff;
  color: white;
  border-color: #1677ff;
}

.a2-button--primary:hover {
  background: #4096ff;
  border-color: #4096ff;
}

.a2-button--default {
  background: white;
  color: #333;
}

.a2-button--default:hover {
  border-color: #4096ff;
  color: #4096ff;
}
</style>
