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
    tags: ["工作日十点半前睡", "周末会去深圳湾骑车", "能接受稳定关系慢慢来"],
    bio: "工作节奏不算轻，所以会更珍惜下班后的时间。平时喜欢自己做点吃的、收拾房间、周末去海边吹风。希望认识一个说话温和、愿意认真投入关系的人，不用太会表达，但要稳定。",
    prompt: "如果第一次见面不尴尬，我会想一起去深圳湾散步，然后找家安静一点的小店吃饭。",
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
    tags: ["周三固定打羽毛球", "通勤路上听播客", "不太喜欢反复试探"],
    bio: "工作里比较理性，生活里反而希望关系简单一点。喜欢有边界感、情绪稳定、愿意好好说话的人。比起热闹，我更在意相处时是不是轻松，能不能自然地聊到很晚。",
    prompt: "最近反复在听城市漫游和亲密关系类播客，总觉得认真聊天本身就是一种筛选。",
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
    tags: ["周末背相机乱走", "路过花店会停一下", "不玩突然消失"],
    bio: "朋友都说我看起来有点安静，但熟了以后其实挺爱说话。比起被人猛烈追求，我更喜欢那种相处里慢慢积累出来的喜欢。希望你有基本的分寸感，也有一点生活趣味。",
    prompt: "如果第一次见面聊得自然，我大概率会主动提第二次咖啡。",
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
    tags: ["周末看展或探店", "很少熬夜", "喜欢有回应的人"],
    bio: "有点慢热，所以不太适合特别快节奏的关系。比较喜欢那种彼此都忙，但还是愿意留时间给对方的状态。对我来说，靠谱不只是准时和守约，也包括情绪上不让人猜来猜去。",
    prompt: "理想关系是彼此都能做自己，但也会很自然地把对方放进生活安排里。",
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
    tags: ["下班后爱走路回家", "拿铁少糖", "聊天不喜欢端着"],
    bio: "不太喜欢把关系搞得很复杂。平时工作写代码已经够费脑子了，感情里就更希望舒服一点。想认识一个沟通正常、脾气不差、对未来有自己打算的人，最好也愿意一起把日子过具体。",
    prompt: "如果你也喜欢下班以后压马路、随便聊点生活里的小事，我们应该会聊得来。",
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
    { from: "p-01", text: "看到你资料里写了会去海边散步，深圳湾你常去吗？" },
    { from: "demo-user", text: "去得挺多，晚上风大的时候反而舒服。" },
    { from: "p-01", text: "那我们审美可能差不多，我也更喜欢那种有点风、但不吵的地方。" }
  ],
  "p-03": [
    { from: "p-03", text: "你资料里写了喜欢周末看展，我第一眼就注意到了。" },
    { from: "demo-user", text: "被你发现了，这个爱好平时不太容易遇到同类。" },
    { from: "p-03", text: "那很合理，我们可以先从一杯咖啡开始，不急着安排很满。" }
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
