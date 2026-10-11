<template>
  <component v-if="component" :is="component" v-bind="getComponentProps(schema)"
    @update:modelValue="(val) => updateInputValue(schema.path, val)" @clickAction="clickAction">
    <template v-if="validChildren && validChildren.length">
      <a2ui-node v-for="(child, index) in validChildren" :key="index" :schema="child"
        @update:modelValue="(val) => updateInputValue(child.path, val)" @clickAction="clickAction" />
    </template>
  </component>
</template>

<script setup>
import A2Vertical from "./a2ui/A2Vertical.vue";
import A2Horizontal from "./a2ui/A2Horizontal.vue";
import A2Text from "./a2ui/A2Text.vue";
import A2Input from "./a2ui/A2Input.vue";
import A2Button from "./a2ui/A2Button.vue";
import A2Image from "./a2ui/A2Image.vue";
import { computed } from "vue";
const componentMap = {
  "a2-vertical": A2Vertical,
  "a2-horizontal": A2Horizontal,
  "a2-text": A2Text,
  "a2-input": A2Input,
  "a2-button": A2Button,
  "a2-image": A2Image
};
const props = defineProps({
  schema: {
    type: Object,
    required: true,
  },
});

// A2UI payloads use `component`; older payloads may use `type`.
const component = computed(() => componentMap[props.schema.component || props.schema.type]);

const validChildren = computed(() => {
  if (!props.schema.children || !props.schema.children.length) return [];
  return props.schema.children.filter((child) => typeof child !== "string");
});


const emit = defineEmits(["clickAction", "updateAction"]);

const getComponentProps = (schema) => {
  const { type, component: componentType, children, ...rest } = schema;
  const resolvedType = componentType || type;

  if (resolvedType === "a2-input") {
    return {
      ...rest,
      modelValue: rest.value || "",
    };
  }

  return rest;
};

const clickAction = (action) => {
  console.log(action,'a2node');
  emit("clickAction", action || props.schema.action);
};
const updateInputValue = (path, value) => {
  console.log(path, value, 'a2node')
  emit("updateAction", { path, value });
};

</script>
