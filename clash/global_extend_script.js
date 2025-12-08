function main(config) {
  // 1. 获取订阅中的所有代理节点名称
  // 过滤掉不可用的节点类型（视情况而定，这里保留所有）
  const proxies = config.proxies || [];
  const proxyNames = proxies.map((p) => p.name);

  // 2. 定义动态策略组生成的规则
  // 注意：JS正则不支持 (?i) 行内标记，统一使用 new RegExp(..., 'i') 开启忽略大小写
  const dynamicRules = [
    // --- 基础国家节点 (Select) ---
    {
      name: "🇭🇰 香港节点",
      type: "select",
      regex: /(?=.*(香港|港|HK|Hong))/i,
    },
    {
      name: "🇸🇬 新加坡节点",
      type: "select",
      regex: /(?=.*(新加坡|坡|新|狮城|SG|Singapore))/i,
    },
    {
      name: "🇨🇳 台湾节点",
      type: "select",
      regex: /(?=.*(台湾|台|湾|台灣|TW|Taiwan))/i,
    },
    {
      name: "🇯🇵 日本节点",
      type: "select",
      regex: /(?=.*(日本|日|JP|Japan))/i,
    },
    {
      name: "🇺🇲 美国节点",
      type: "select",
      regex: /(?=.*(美国|美|美國|US|States|American))/i,
    },
    {
      name: "🇰🇷 韩国节点",
      type: "select",
      regex: /(?=.*(韩国|韩|韓國|南朝鲜|KR|Korean))/i,
    },

    // --- 家宽/落地节点 (Select) ---
    // 匹配同时包含 [家]或[落] 以及 对应国家 的节点
    {
      name: "🏠 家-香港落地",
      type: "select",
      regex: /(?=.*(\[家\]|\[落\]))(?=.*香港)/i,
    },
    {
      name: "🏠 家-台湾落地",
      type: "select",
      regex: /(?=.*(\[家\]|\[落\]))(?=.*台湾)/i,
    },
    {
      name: "🏠 家-日本落地",
      type: "select",
      regex: /(?=.*(\[家\]|\[落\]))(?=.*日本)/i,
    },
    {
      name: "🏠 家-新加坡落地",
      type: "select",
      regex: /(?=.*(\[家\]|\[落\]))(?=.*新加坡)/i,
    },
    {
      name: "🏠 家-美国落地",
      type: "select",
      regex: /(?=.*(\[家\]|\[落\]))(?=.*美国)/i,
    },

    // --- 机场/入口负载均衡 (Load-Balance) ---
    // 匹配同时包含 [机] 以及 对应国家 的节点
    {
      name: "⚖️ 机-香港负载",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      regex: /^(?=.*\[机\])(?=.*\[专线\])(?=.*香港).*/i,
    },
    {
      name: "⚖️ 机-日本负载",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      regex: /^(?=.*\[机\])(?=.*\[专线\])(?=.*日本).*/i,
    },
    {
      name: "⚖️ 机-台湾负载",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      regex: /^(?=.*\[机\])(?=.*\[专线\])(?=.*台湾).*/i,
    },
    {
      name: "⚖️ 机-新加坡负载",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      regex: /^(?=.*\[机\])(?=.*\[专线\])(?=.*新加坡).*/i,
    },
    {
      name: "⚖️ 机-美国负载",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 300,
      strategy: "round-robin",
      regex: /^(?=.*\[机\])(?=.*\[专线\])(?=.*美国).*/i,
    },

    // --- 专线负载均衡 (Load-Balance) ---
    {
      name: "⚖️ 负载均衡 - 新港日台专线",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 120,
      strategy: "consistent-hashing",
      regex:
        /(?=.*(HK|Hong Kong|香港|港|SG|Singapore|新加坡|坡|狮城|JP|Japan|日本|台湾|TW|Taiwan))(?=.*(iepl|专线))/i,
    },
    {
      name: "⚖️ 负载均衡 - 美国专线",
      type: "load-balance",
      url: "http://www.gstatic.com/generate_204",
      interval: 120,
      strategy: "consistent-hashing",
      regex: /(?=.*(us|美国|美))(?=.*(iepl|专线))/i,
    },
  ];

  // --- 特殊规则: 🧺 其他节点 ---
  // 需要排除上面所有关键词
  const otherRule = {
    name: "🧺 其他节点",
    type: "select",
    // 这是一个复杂的负向先行断言，排除了所有主要国家关键词和过期关键词
    regex:
      /^(?!.*(?:过期|到期|剩余|时间|流量|活动|优惠|香港|港|台湾|台|湾|台灣|日本|日|美国|美|美國|韩国|韩|韓國|南朝鲜|新加坡|坡|新|狮城|expire|expiry|expiration|due|remain|remaining|left|time|data|traffic|usage|hk|hong kong|sg|singapore|tw|taiwan|jp|japan|us|states|american|kr|korean)).*$/i,
  };

  // 3. 辅助函数：根据正则筛选节点名称
  const getMatchedProxies = (names, regex) => {
    return names.filter((name) => regex.test(name));
  };

  // 4. 生成动态组并添加到配置中
  // 确保 config['proxy-groups'] 存在
  if (!config["proxy-groups"]) {
    config["proxy-groups"] = [];
  }

  // A. 处理标准动态规则
  dynamicRules.forEach((rule) => {
    // 筛选符合正则的节点
    let matched = getMatchedProxies(proxyNames, rule.regex);

    // 如果没有匹配到节点，为了防止报错，可以添加一个 'DIRECT' 或者保留为空(Clash核心可能报错)
    // 这里如果为空，默认放入 'DIRECT' 以保底，或者你可以选择不创建该组
    if (matched.length === 0) {
      matched.push("DIRECT");
    }

    const newGroup = {
      name: rule.name,
      type: rule.type,
      proxies: matched,
    };

    // 如果是负载均衡类型，添加额外参数
    if (rule.type === "load-balance") {
      newGroup.url = rule.url;
      newGroup.interval = rule.interval;
      newGroup.strategy = rule.strategy;
    }

    config["proxy-groups"].push(newGroup);
  });

  // B. 处理 "其他节点" 规则
  let otherProxies = getMatchedProxies(proxyNames, otherRule.regex);
  if (otherProxies.length > 0) {
    config["proxy-groups"].push({
      name: otherRule.name,
      type: otherRule.type,
      proxies: otherProxies,
    });
  } else {
    // 如果没有匹配到其他节点，创建一个空的或者含DIRECT的，防止静态组引用报错
    config["proxy-groups"].push({
      name: otherRule.name,
      type: otherRule.type,
      proxies: ["DIRECT"],
    });
  }

  // 5. 返回修改后的配置
  return config;
}
