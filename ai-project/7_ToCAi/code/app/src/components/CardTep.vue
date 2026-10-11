<script setup>
import { defineAsyncComponent } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['userSend'])

const cardMap = {
  listCard: defineAsyncComponent(() => import('../card/ListCard.vue')),
  orderCard: defineAsyncComponent(() => import('../card/OrderCard.vue'))
}

const CardComponent = cardMap[props.data.name]

function handleUserSend(text) {
  emit('userSend', text)
}
</script>

<template>
  <component :is="CardComponent" v-if="CardComponent" :data="data.data" @userSend="handleUserSend" />
  <div v-else class="card-tep card-error">
    未找到卡片: {{ data.name }}
  </div>
</template>

<style scoped>
.card-tep {
  display: flex;
  flex-direction: column;
  width: 240px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.2s ease;
}

.card-tep:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.card-error {
  padding: 16px;
  color: #e4393c;
  font-size: 14px;
  text-align: center;
}

.card-image {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

.card-body {
  padding: 12px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.4;
  margin-bottom: 6px;
}

.card-desc {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  margin-bottom: 8px;
}

.card-price {
  font-size: 16px;
  font-weight: 700;
  color: #e4393c;
}

.card-tag {
  display: inline-block;
  margin-top: 6px;
  padding: 2px 8px;
  font-size: 12px;
  color: #fff;
  background: #409eff;
  border-radius: 4px;
}
</style>
