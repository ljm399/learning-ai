<template>
  <div class="a2ui-renderer">
    <a2ui-node v-if="parsedSchema.components.length > 0" :schema="parsedSchema.components?.[0]"
      @clickAction="clickAction" @updateAction="updateAction" />
    <div v-else>骨架屏</div>
  </div>
</template>

<script setup>
import { computed, reactive } from "vue";
import A2uiNode from "./A2uiNode.vue";

const props = defineProps({
  content: {
    type: [String, Object],
    default: "",
  },
});

const emit = defineEmits(["submit"]);

const parsedSchema = computed(() => {
  if (!props.content) return null;
  try {
    const raw =
      typeof props.content === "string"
        ? JSON.parse(props.content)
        : props.content;
    return resolveSchema(raw);
  } catch (e) {
    console.error("A2uiRenderer: JSON 解析失败", e);
    return null;
  }
});

/**
 * 根据数据模型解析 path 占位符，返回实际值
 * content 为 { path: "/list/0/name" } 时，从 dataModel 中查找对应数据
 */

/*
dataModel
{
 "/product":{
              "id": "1",
              "name": "商品一",
              "price": "¥99.99",
              "description": "这是商品一的描述信息"
    }
}
*/
function resolveContentPath(content, dataModel) {
  if (!content || typeof content !== "object" || !content.path) return content;
  if (!dataModel || Object.keys(dataModel).length === 0) return content;

  const contentPath = content.path;

  // 找到 dataModel 中最长匹配的前缀 key
  let bestKey = "";
  let bestValue = undefined;
  for (const [key, value] of Object.entries(dataModel)) {
    if (contentPath.startsWith(key) && key.length > bestKey.length) {
      bestKey = key;
      bestValue = value;
    }
  }

  if (!bestKey) return content;

  // 剩余路径： /0/name 去掉 /list → /0/name
  const remaining = contentPath.slice(bestKey.length);
  if (!remaining || remaining === "/") return bestValue;

  // 按 / 分割，遍历取值
  const segments = remaining.split("/").filter(Boolean);
  let current = bestValue;
  for (const seg of segments) {
    if (current == null) return content;
    // 数字索引用于数组
    const index = parseInt(seg, 10);//第二个参数 10 表示使用十进制解析。
    if (!isNaN(index) && Array.isArray(current)) {
      current = current[index];
    } else if (typeof current === "object") {
      current = current[seg];
    } else {
      return content;
    }
  }

  return current ?? content;
}

/**
 * 递归遍历组件树，将 content 中的 path 占位符替换为实际数据
 */
/*
dataModel
 {
   "/product":{
                "id": "1",
                "name": "商品一",
                "price": "¥99.99",
                "description": "这是商品一的描述信息"
      }
  }
*/
function resolveComponentData(comp, dataModel) {
  if (!comp) return comp;
  const resolved = { ...comp };

  // 解析 content 中的 path 占位符
  //resolve就是当个的组件对象
  if (resolved.content) {
    resolved.content = resolveContentPath(resolved.content, dataModel);
  }
  if (resolved.src){ resolved.src = resolveContentPath(resolved.src, dataModel); 
  }

  // 递归处理 children
  if (Array.isArray(resolved.children)) {
    resolved.children = resolved.children.map((child) => {
      if (typeof child === "string") return child;
      return resolveComponentData(child, dataModel);
    });
  }

  return resolved;
}

function resolveSchema(schema) {
  if (!schema || !schema.components) return schema;
  const { surfaceId, components, dataModel = {} } = schema;

  // 先用数据模型解析所有组件中的 path 占位符
  const resolvedDataComponents = components.map((comp) =>
    resolveComponentData(comp, dataModel)
  );

  // 构建 id → 组件 的映射
  const componentMap = {};
  for (const comp of resolvedDataComponents) {
    if (comp.id) {
      componentMap[comp.id] = comp;
    }
  }

  // 收集所有被 children 引用的 id
  const referencedIds = new Set();

  // 递归解析 children：将字符串 id 替换为实际组件对象，并递归处理嵌套 children
  function resolveChildren(children) {
    if (!Array.isArray(children)) return children;
    return children.map((child) => {
      if (typeof child === "string") {
        const resolved = componentMap[child];
        if (resolved) {
          referencedIds.add(child);
          // 递归解析被引用组件自身的 children（处理 children 里还有 children 的情况）
          if (resolved.children) {
            resolved.children = resolveChildren(resolved.children);
          }
          return resolved;
        }
        return child;
      }
      // 如果已经是对象，递归处理其 children
      if (child && child.children) {
        child.children = resolveChildren(child.children);
      }
      return child;
    });
  }

  // 处理所有组件的 children
  const resolvedComponents = resolvedDataComponents.map((comp) => {
    if (comp.children) {
      return { ...comp, children: resolveChildren(comp.children) };
    }
    return comp;
  });

  // 移除被 children 引用过的组件，只保留顶层未被引用的
  const topLevelComponents = resolvedComponents.filter(
    (comp) => !referencedIds.has(comp.id)
  );

  return { surfaceId, components: topLevelComponents };
}

const dataModel = reactive({});

function updateAction({ path, value }) {

  if (!path) return;
  dataModel[path] = value;
}

function clickAction(action) {
  const resolvedAction = resolveAction(action);
  emit("submit", resolvedAction);
}

function resolveAction(action) {
  if (typeof action === "string") {
    return { name: action, context: {} };
  }
  if (!action || typeof action !== "object") {
    return action;
  }
  const resolvedContext = {};
  if (action.context) {
    for (const [key, value] of Object.entries(action.context)) {
      resolvedContext[key] =
        typeof value === "string" && value.startsWith("/") && value in dataModel
          ? dataModel[value]
          : value;
    }
  }
  return { ...action, context: resolvedContext };
}
</script>

<style scoped>
.a2ui-renderer {
  display: block;
}
</style>