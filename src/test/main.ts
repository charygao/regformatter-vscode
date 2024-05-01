
const str = 'The quick brown fox jumps over the lazy dog. If the dog reacted, was it really lazy?';
const regex = /(\b\w+?\b)/g; // 捕获单词
 
// 使用捕获组进行替换，这里我们将每个单词转换为大写
const result = str.replaceAll(regex, (match, group1) => {
  return group1.toUpperCase();
});
 
console.log(result);