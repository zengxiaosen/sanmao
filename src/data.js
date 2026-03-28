export const seedProfiles = [
  {
    id: "p-01",
    name: "林清禾",
    age: 23,
    gender: "female",
    city: "深圳",
    company: "腾讯",
    role: "产品经理",
    school: "中山大学",
    height: "165cm",
    tags: ["周末徒步", "认真恋爱", "会做早午餐"],
    bio: "喜欢把生活过得有一点秩序，也愿意给喜欢的人留很多松弛感。",
    prompt: "理想的周末是：骑车去深圳湾，傍晚看海，晚上找家小馆子聊天。",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p-02",
    name: "周以宁",
    age: 24,
    gender: "female",
    city: "深圳",
    company: "字节跳动",
    role: "算法工程师",
    school: "华南理工大学",
    height: "168cm",
    tags: ["羽毛球", "播客", "INFJ"],
    bio: "工作很理性，生活想留给真实的人。希望认识三观稳定、情绪成熟的人。",
    prompt: "最近在反复听关于城市漫游和亲密关系的播客。",
    avatar:
      "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p-03",
    name: "陈星野",
    age: 25,
    gender: "female",
    city: "深圳",
    company: "美团",
    role: "商业分析",
    school: "暨南大学",
    height: "163cm",
    tags: ["摄影", "海边散步", "小狗派"],
    bio: "比起热闹，我更喜欢稳定又舒服的关系。会认真看你的资料，不玩消失。",
    prompt: "如果第一次见面不尴尬，我会想约第二次咖啡。",
    avatar:
      "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p-04",
    name: "许闻溪",
    age: 24,
    gender: "female",
    city: "深圳",
    company: "小红书",
    role: "运营",
    school: "深圳大学",
    height: "166cm",
    tags: ["探店", "展览", "早睡早起"],
    bio: "有点慢热，但熟了以后很好相处。希望你说话算数，也愿意认真投入关系。",
    prompt: "理想关系是彼此独立，但都愿意留时间给对方。",
    avatar:
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=900&q=80"
  },
  {
    id: "p-05",
    name: "沈昭",
    age: 23,
    gender: "female",
    city: "深圳",
    company: "华为",
    role: "前端工程师",
    school: "哈尔滨工业大学（深圳）",
    height: "167cm",
    tags: ["胶片", "citywalk", "拿铁"],
    bio: "不需要太多套路，希望遇到一个能正常沟通、愿意一起把日子过好的人。",
    prompt: "如果你也喜欢下班后压马路，我们应该会聊得来。",
    avatar:
      "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80"
  }
];

export const mutualLikes = {
  "p-01": ["demo-user"],
  "p-03": ["demo-user"]
};

export const chatThreads = {
  "p-01": [
    { from: "p-01", text: "看到你也喜欢海边散步，深圳湾还是前海？" },
    { from: "demo-user", text: "深圳湾更常去，风大的时候也挺舒服。" },
    { from: "p-01", text: "那周末可以一起走一圈，再找地方吃饭。" }
  ],
  "p-03": [
    { from: "p-03", text: "你资料里写了喜欢周末看展，这个点很加分。" },
    { from: "demo-user", text: "哈哈，终于被识别到了。" },
    { from: "p-03", text: "那我们先从一杯咖啡开始吧。" }
  ]
};

export const defaultProfile = {
  id: "demo-user",
  name: "",
  age: "",
  gender: "male",
  city: "深圳",
  company: "",
  role: "",
  school: "",
  tags: "",
  bio: ""
};
