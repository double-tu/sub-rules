import sys
import requests
from ruamel.yaml import YAML

# 配置部分
INPUT_FILE = 'global_base_template.yaml'  # 你的配置文件名
OUTPUT_FILE = 'global_base_template_cleaned.yaml' # 输出的文件名，建议先不覆盖源文件，确认无误后再替换
TIMEOUT = 10 # 请求超时时间（秒）

def check_url_status(name, url):
    """
    检查 URL 是否有效
    返回: True (有效), False (无效)
    """
    if not url:
        return False
    
    headers = {
        'User-Agent': 'Clash/1.0' # 伪装一下 User-Agent，防止被某些服务器拒绝
    }
    
    print(f"正在检查 Provider [{name}]: {url} ...", end="", flush=True)
    
    try:
        # 使用 stream=True 只获取头部信息，减少流量消耗，但为了检查 content 长度，还是读一下
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
        
        # 判断状态码
        if response.status_code != 200:
            print(f" ❌ 失败 (状态码: {response.status_code})")
            return False
        
        # 判断内容是否为空
        if len(response.text.strip()) == 0:
            print(f" ❌ 失败 (内容为空)")
            return False
            
        print(" ✅ 正常")
        return True
        
    except requests.RequestException as e:
        print(f" ❌ 连接错误: {e}")
        return False

def clean_clash_config():
    # 初始化 YAML 实例
    yaml = YAML()
    # 保持缩进和格式配置
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)

    try:
        with open(INPUT_FILE, 'r', encoding='utf-8') as f:
            data = yaml.load(f)
    except FileNotFoundError:
        print(f"找不到文件: {INPUT_FILE}")
        return

    # 1. 检查 rule-providers
    if 'rule-providers' not in data:
        print("未找到 rule-providers 配置，无需处理。")
        return

    providers = data['rule_providers'] if 'rule_providers' in data else data.get('rule-providers')
    
    # 为了兼容 yaml key 可能带下划线或连字符的情况
    provider_key = 'rule-providers' if 'rule-providers' in data else 'rule_providers'
    
    if not providers:
        print("rule-providers 为空。")
        return

    invalid_providers = []

    print("=== 开始检查分流规则链接 ===")
    for name, config in providers.items():
        url = config.get('url')
        if not check_url_status(name, url):
            invalid_providers.append(name)
    
    if not invalid_providers:
        print("\n所有规则链接均正常，无需修改。")
        return

    print(f"\n检测到 {len(invalid_providers)} 个失效规则，开始清理...")

    # 2. 删除失效的 rule-providers 定义
    for name in invalid_providers:
        print(f"移除 Provider 定义: {name}")
        del data[provider_key][name]

    # 3. 删除 rules 中引用的部分
    if 'rules' in data and data['rules']:
        original_rule_count = len(data['rules'])
        new_rules = []
        
        for rule in data['rules']:
            # Clash 规则通常是字符串，如 "RULE-SET,AdBlock_1,REJECT"
            # 我们需要判断这行规则是否使用了我们要删除的 provider
            should_delete = False
            
            # 简单的字符串包含检查可能误伤（例如 AdBlock_1 和 AdBlock_11），所以需要分割检查
            parts = rule.split(',')
            if len(parts) >= 2:
                rule_type = parts[0].strip().upper()
                rule_target = parts[1].strip()
                
                # 只有当类型是 RULE-SET 且 目标名称在失效列表中时，才删除
                if rule_type == 'RULE-SET' and rule_target in invalid_providers:
                    should_delete = True
                    print(f"移除引用规则: {rule.strip()}")

            if not should_delete:
                new_rules.append(rule)
        
        data['rules'] = new_rules
        print(f"规则清理完毕。原规则数: {original_rule_count}, 现规则数: {len(new_rules)}")

    # 4. 保存文件
    print(f"\n正在保存到 {OUTPUT_FILE} ...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        yaml.dump(data, f)
    
    print("处理完成！")

if __name__ == '__main__':
    clean_clash_config()
