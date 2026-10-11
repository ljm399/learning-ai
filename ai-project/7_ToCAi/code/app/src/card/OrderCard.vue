<script setup>
const { data } = defineProps(["data"])

const emit = defineEmits(["userSend"])

function handleReturn(item) {
  emit("userSend", `我要退货，id为${item.productId}`)
}
</script>

<template>
  <div class="card-tep">
    <div class="order-list">
      <div v-for="item in data.orders" :key="item.productId" class="order-item">

        <div class="order-header">
          <span class="order-no">商品ID：{{ item.productId }}</span>
        </div>
        <div class="order-body">
          <img :src="item.productImage" class="order-image" />
          <div class="order-info">
            <div class="order-title">{{ item.productName }}</div>
            <div class="order-price">¥{{ item.payPrice }}</div>
          </div>
        </div>
        <div class="order-footer">
          <span class="order-date">{{ item.orderDate }}</span>
          <button class="btn-return" @click="handleReturn(item)">退货</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-tep {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 480px;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.2s ease;
}

.card-tep:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: #f0f0f0;
}

.order-item {
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  background: #fff;
  gap: 12px;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-no {
  font-size: 13px;
  color: #666;
}

.order-status {
  font-size: 13px;
  color: #409eff;
  font-weight: 500;
}

.order-body {
  display: flex;
  gap: 12px;
}

.order-image {
  width: 88px;
  height: 88px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.order-info {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.order-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.4;
}

.order-desc {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.order-price {
  font-size: 16px;
  font-weight: 700;
  color: #e4393c;
}

.order-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.order-date {
  font-size: 13px;
  color: #999;
}

.btn-return {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  background: #e4393c;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-return:hover {
  opacity: 0.85;
}
</style>
