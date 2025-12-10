function main(config) {
  const proxies = config.proxies || [];
  const proxyNames = proxies.map((p) => p.name);

  // ============================================
  // 1. 定义区域配置 (顺序决定了界面上的排列顺序)
  // ============================================
  const regions = [
    { code: "HK", name: "香港", keywords: ["香港", "港", "HK", "Hong"], entryType: "load-balance", exitRegex: /(?=.*(\[家\]|\[落\]))(?=.*香港)/i },
    { code: "TW", name: "台湾", keywords: ["台湾", "台", "湾", "台灣", "TW", "Taiwan"], entryType: "load-balance", exitRegex: /(?=.*(\[家\]|\[落\]))(?=.*台湾)/i },
    { code: "JP", name: "日本", keywords: ["日本", "日", "JP", "Japan"], entryType: "load-balance", exitRegex: /(?=.*(\[家\]|\[落\]))(?=.*日本)/i },
    { code: "SG", name: "新加坡", keywords: ["新加坡", "坡", "新", "狮城", "SG", "Singapore"], entryType: "load-balance", exitRegex: /(?=.*(\[家\]|\[落\]))(?=.*新加坡)/i },
    { code: "US", name: "美国", keywords: ["美国", "美", "美國", "US", "States", "American"], entryType: "load-balance", exitRegex: /(?=.*(\[家\]|\[落\]))(?=.*美国)/i },
  ];

  const getMatchedNames = (names, regex) => names.filter((name) => regex.test(name));

  if (!config["proxy-groups"]) config["proxy-groups"] = [];

  // ============================================
  // 2. 创建临时“桶”来存放不同类型的组
  // ============================================
  const generatedChains = [];    // 存放 🔗 链式组 (优先级高)
  const generatedSelects = [];   // 存放 🇭🇰 普通地区组
  const generatedInfra = [];     // 存放 🏠 落地 和 ⚖️ 负载 (底层设施，放最后)

  // 遍历地区生成组
  regions.forEach(region => {
    // --- A. 基础国家组 ---
    const baseRegex = new RegExp(`(?=.*(${region.keywords.join("|")}))`, "i");
    const baseGroupName = `${getFlag(region.code)} ${region.name}节点`;
    generatedSelects.push({
      name: baseGroupName,
      type: "select",
      proxies: getMatchedNames(proxyNames, baseRegex).length > 0 ? getMatchedNames(proxyNames, baseRegex) : ["DIRECT"]
    });

    // --- B. 落地/家宽组 ---
    const exitNames = getMatchedNames(proxyNames, region.exitRegex);
    generatedInfra.push({
      name: `🏠 家-${region.name}落地`,
      type: "select",
      proxies: exitNames.length > 0 ? exitNames : ["DIRECT"]
    });

    // --- C. 机场入口组 ---
    const entryRegex = new RegExp(`^(?=.*\\[机\\])(?=.*\\[专线\\])(?=.*${region.name}).*`, "i");
    const entryNames = getMatchedNames(proxyNames, entryRegex);
    const entryGroupName = `⚖️ 机-${region.name}负载`;
    // 兜底逻辑：如果找不到专线，用普通节点代替
    const finalEntryProxies = entryNames.length > 0 ? entryNames : (getMatchedNames(proxyNames, baseRegex).length > 0 ? getMatchedNames(proxyNames, baseRegex) : ["DIRECT"]);
    
    generatedInfra.push({
      name: entryGroupName,
      type: region.entryType,
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      proxies: finalEntryProxies
    });

    // --- D. 链式组核心逻辑 ---
    const rawExitProxies = proxies.filter(p => region.exitRegex.test(p.name));
    const chainedProxyNames = [];
    
    rawExitProxies.forEach(proxy => {
      // 克隆并注入 dialer-proxy
      const newProxy = JSON.parse(JSON.stringify(proxy));
      newProxy.name = `🔗 ${proxy.name}`; 
      newProxy["dialer-proxy"] = entryGroupName;
      config.proxies.push(newProxy);
      chainedProxyNames.push(newProxy.name);
    });

    generatedChains.push({
      name: `🔗 链-${region.name}`,
      type: "select", 
      proxies: chainedProxyNames.length > 0 ? chainedProxyNames : ["DIRECT"]
    });
  });

  // ============================================
  // 3. 排序与合并 (解决顺序乱的问题)
  // ============================================
  
  // 策略：保留 YAML 中原有的组，将新生成的组插入到特定位置
  // 1. 把所有生成的组按类型合并：链式组 -> 普通组 -> 底层设施
  // 这样 🔗链-香港 就会紧挨着 🔗链-台湾，而不是中间夹杂着其他组
  
  // 2. 找到 "✈️ 起飞出国" 的位置 (或者你主策略组的名字)
  const insertIndex = config["proxy-groups"].findIndex(g => g.name === "✈️ 起飞出国");
  
  if (insertIndex !== -1) {
    // 如果找到了，把“链式组”插到“起飞出国”后面，方便切换
    config["proxy-groups"].splice(insertIndex + 1, 0, ...generatedChains);
    
    // 把“普通地区组”和“底层设施”追加到最后面 (或者你可以选择插在其他位置)
    config["proxy-groups"].push(...generatedSelects);
    
    // 处理其他节点 (非地区类)
    const otherRegex = /^(?!.*(?:过期|到期|剩余|时间|流量|活动|优惠|香港|港|台湾|台|湾|台灣|日本|日|美国|美|美國|韩国|韩|韓國|南朝鲜|新加坡|坡|新|狮城|expire|expiry|expiration|due|remain|remaining|left|time|data|traffic|usage|hk|hong kong|sg|singapore|tw|taiwan|jp|japan|us|states|american|kr|korean)).*$/i;
    const otherProxies = getMatchedNames(proxyNames, otherRegex);
    config["proxy-groups"].push({
      name: "🧺 其他节点",
      type: "select",
      proxies: otherProxies.length > 0 ? otherProxies : ["DIRECT"]
    });

    // 最后放入底层设施（因为平时不怎么看，放最下面）
    config["proxy-groups"].push(...generatedInfra);
    
  } else {
    // 如果没找到主策略组，就直接全部按顺序追加
    config["proxy-groups"].push(
      ...generatedChains, 
      ...generatedSelects, 
      ...generatedInfra
    );
  }

  return config;
}

function getFlag(code) {
  const map = { HK: "🇭🇰", TW: "🇨🇳", JP: "🇯🇵", SG: "🇸🇬", US: "🇺🇲" };
  return map[code] || "🏳️";
}
