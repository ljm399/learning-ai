<script setup>
const { data } = defineProps(["data"])

const emit = defineEmits(["userSend"])

function handleTryOn(item) {
  //这是一个通用事件，以后的所有卡片，如果点击后是让AI去做某个事情，都是触发这个事件
  //事件把要发给ai的消息拼接好
  emit("userSend", `我要试穿，id为${item.id}的服装`)
}
function buy(item) {
  // axios.post("/pay", { id: item.id }).then((res) => {
  //    const url= res.data.url;
  //    window.location=url;
  // })
  emit("userSend", `我要购买，id为${item.id}的服装`)
}
</script>

<template>
  <div class="card-tep">
    <div class="product-list">
      <div v-for="item in data" :key="item.id" class="product-item">
        <img :src="item.image" class="product-image" />
        <div class="product-body">
          <div class="product-info">
            <div class="product-title">{{ item.title }}</div>
            <div class="product-desc">{{ item.description }}</div>
            <div class="product-price">¥{{ item.price }}</div>
          </div>
          <div class="product-actions">
            <button class="btn-try" @click="handleTryOn(item)">试穿</button>
            <button class="btn-buy" @click="buy(item)">购买</button>
          </div>
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

.product-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  background: #f0f0f0;
}

.product-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  background: #fff;
}

.product-image {
  width: 88px;
  height: 88px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.product-body {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
}

.product-title {
  font-size: 15px;
  font-weight: 600;
  color: #1a1a1a;
  line-height: 1.4;
}

.product-desc {
  font-size: 13px;
  color: #666;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.product-price {
  font-size: 16px;
  font-weight: 700;
  color: #e4393c;
}

.product-actions {
  display: flex;
  gap: 10px;
}

.btn-try,
.btn-buy {
  flex: 1;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-try:hover,
.btn-buy:hover {
  opacity: 0.85;
}

.btn-try {
  color: #409eff;
  background: #ecf5ff;
}

.btn-buy {
  color: #fff;
  background: #e4393c;
}
</style>
