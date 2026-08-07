from __future__ import annotations

from copy import deepcopy
from typing import Any


PACK_VERSION = 2

STAGES = [
    {
        "id": "foundation",
        "level": "Pre-A1",
        "title": "开口起步",
        "can_do": "能辨认核心声音或文字，并完成问候和自我介绍。",
        "scenarios": [
            ("greeting", "问候与声音", "能自然地打招呼、回应并结束一次简短问候。"),
            ("identity", "介绍自己", "能说出姓名、来自哪里和正在学习什么。"),
        ],
    },
    {
        "id": "survival",
        "level": "A1",
        "title": "生存沟通",
        "can_do": "能在清晰、缓慢的交流中处理数字、时间、点餐和基本需求。",
        "scenarios": [
            ("numbers", "数字、时间与联系", "能确认时间、价格和联系方式。"),
            ("food", "点餐与偏好", "能点一份餐、表达偏好并礼貌致谢。"),
        ],
    },
    {
        "id": "daily",
        "level": "A2",
        "title": "日常互动",
        "can_do": "能在熟悉场景中问路、安排活动并交换简单信息。",
        "scenarios": [
            ("directions", "问路与交通", "能询问方向、听懂关键路线并确认是否走对。"),
            ("routine", "日常与约见", "能描述日常安排并和别人约定时间。"),
        ],
    },
    {
        "id": "independent",
        "level": "B1",
        "title": "独立表达",
        "can_do": "能在旅行和日常工作中解决问题，并用连贯句子讲述经历。",
        "scenarios": [
            ("problems", "说明问题并求助", "能清楚说明发生了什么、需要什么帮助。"),
            ("story", "讲述一次经历", "能按时间顺序讲述经历并表达感受。"),
        ],
    },
    {
        "id": "natural",
        "level": "B2",
        "title": "自然交流",
        "can_do": "能说明观点、回应理由，并根据关系和场合调整语气。",
        "scenarios": [
            ("opinions", "观点与理由", "能提出观点、给出依据并邀请对方回应。"),
            ("nuance", "礼貌分歧与语气", "能不同意对方而不让交流中断。"),
        ],
    },
    {
        "id": "fluent",
        "level": "C1",
        "title": "成熟运用",
        "can_do": "能清晰解释复杂内容，理解语域、暗示和文化幽默。",
        "scenarios": [
            ("professional", "解释复杂内容", "能为不同听众重组并解释复杂信息。"),
            ("culture", "语域、暗示与幽默", "能识别言外之意并选择自然、合宜的回应。"),
        ],
    },
]


def _content(
    phrases: list[tuple[str, str, str, str]],
    passage: tuple[str, str, str],
    culture_note: str,
) -> dict[str, Any]:
    return {
        "phrases": [
            {
                "term": term,
                "pronunciation": pronunciation,
                "meaning": meaning,
                "example": example,
            }
            for term, pronunciation, meaning, example in phrases
        ],
        "passage": {
            "title": passage[0],
            "text": passage[1],
            "translation": passage[2],
        },
        "culture_note": culture_note,
    }


ENGLISH = {
    "greeting": _content(
        [
            ("Hi, how are you?", "/haɪ haʊ ɑːr juː/", "嗨，你好吗？", "Hi, how are you today?"),
            ("I'm good, thanks.", "/aɪm ɡʊd θæŋks/", "我很好，谢谢。", "I'm good, thanks. How about you?"),
            ("See you later.", "/siː juː ˈleɪtər/", "回头见。", "I have to go. See you later."),
        ],
        ("A quick hello", "Maya sees Leo before class. She says, “Hi, how are you?” Leo smiles and says he is good. They agree to talk later.", "上课前 Maya 遇见 Leo。她问候他，Leo 微笑着说自己很好。他们约好稍后再聊。"),
        "英语日常问候常很简短；How are you? 经常是友好开场，不一定要求详细说明近况。",
    ),
    "identity": _content(
        [
            ("My name is…", "/maɪ neɪm ɪz/", "我的名字是……", "My name is Lin."),
            ("I'm from…", "/aɪm frəm/", "我来自……", "I'm from Guangzhou."),
            ("I'm learning English.", "/aɪm ˈlɜːrnɪŋ ˈɪŋɡlɪʃ/", "我正在学英语。", "I'm learning English for work and travel."),
        ],
        ("Meet Lin", "My name is Lin. I'm from Guangzhou, and I'm learning English. I want to speak with people when I travel.", "我叫 Lin，来自广州，正在学习英语。我希望旅行时能和别人交谈。"),
        "初次见面时先给姓名和一条相关信息即可；不要一次塞入过长的个人简历。",
    ),
    "numbers": _content(
        [
            ("What time does it start?", "/wɒt taɪm dʌz ɪt stɑːrt/", "几点开始？", "What time does the meeting start?"),
            ("It starts at half past six.", "/ɪt stɑːrts æt hæf pæst sɪks/", "六点半开始。", "It starts at half past six this evening."),
            ("Could you say that again?", "/kʊd juː seɪ ðæt əˈɡen/", "你能再说一次吗？", "Could you say that number again?"),
        ],
        ("Confirm the time", "The class starts at half past six. Lin writes the time down, then asks the teacher to say the room number again.", "课程六点半开始。Lin 记下时间，又请老师重复一遍教室号码。"),
        "确认数字时直接复述最安全，例如 So that's six thirty, right?",
    ),
    "food": _content(
        [
            ("I'd like…, please.", "/aɪd laɪk pliːz/", "我想要……", "I'd like a coffee, please."),
            ("Could I have it without sugar?", "/kʊd aɪ hæv ɪt wɪˈðaʊt ˈʃʊɡər/", "可以不加糖吗？", "Could I have it without sugar?"),
            ("That's all, thank you.", "/ðæts ɔːl θæŋk juː/", "就这些，谢谢。", "That's all, thank you."),
        ],
        ("At the café", "Lin orders a coffee without sugar and a sandwich. The server checks the order, and Lin says, “That's all, thank you.”", "Lin 点了一杯不加糖的咖啡和一份三明治。服务员确认订单，Lin 表示就这些。"),
        "I'd like… 比 I want… 更适合点餐；please 和 thank you 通常放在完整请求中。",
    ),
    "directions": _content(
        [
            ("How do I get to…?", "/haʊ duː aɪ ɡet tuː/", "怎么去……？", "How do I get to the station?"),
            ("Go straight and turn left.", "/ɡoʊ streɪt ænd tɜːrn left/", "直走然后左转。", "Go straight and turn left at the bank."),
            ("Is it far from here?", "/ɪz ɪt fɑːr frəm hɪr/", "离这里远吗？", "Is it far from here?"),
        ],
        ("Finding the station", "The station is not far. Go straight for two blocks, turn left at the bank, and it is across from the park.", "车站不远。直走两个街区，在银行左转，车站就在公园对面。"),
        "听路线时先抓动作和地标；没听清时可用 So I turn left at the bank? 来确认。",
    ),
    "routine": _content(
        [
            ("I usually…", "/aɪ ˈjuːʒuəli/", "我通常……", "I usually finish work at six."),
            ("Are you free on Saturday?", "/ɑːr juː friː ɒn ˈsætərdeɪ/", "你周六有空吗？", "Are you free on Saturday afternoon?"),
            ("Let's meet around three.", "/lets miːt əˈraʊnd θriː/", "我们三点左右见吧。", "Let's meet around three near the library."),
        ],
        ("Weekend plans", "Maya usually studies on Saturday morning, but she is free after lunch. She and Lin decide to meet around three near the library.", "Maya 通常周六早上学习，但午饭后有空。她和 Lin 决定三点左右在图书馆附近见面。"),
        "around、about 可以柔化时间；重要约会仍应再确认具体时间和地点。",
    ),
    "problems": _content(
        [
            ("There's a problem with…", "/ðerz ə ˈprɒbləm wɪð/", "……出了问题。", "There's a problem with my booking."),
            ("What I need is…", "/wɒt aɪ niːd ɪz/", "我需要的是……", "What I need is a quiet room."),
            ("Could you help me sort this out?", "/kʊd juː help miː sɔːrt ðɪs aʊt/", "你能帮我处理吗？", "Could you help me sort this out?"),
        ],
        ("A booking problem", "Lin's booking has the wrong date. He explains the problem, shows the confirmation email, and asks the receptionist to move the booking to Friday.", "Lin 的预订日期错了。他说明问题、出示确认邮件，并请前台把预订改到周五。"),
        "解决问题时按“事实—影响—请求”表达，通常比只说 This is wrong 更容易得到帮助。",
    ),
    "story": _content(
        [
            ("At first,…", "/æt fɜːrst/", "起初……", "At first, I thought I was on the right train."),
            ("It turned out that…", "/ɪt tɜːrnd aʊt ðæt/", "结果发现……", "It turned out that I was going the wrong way."),
            ("In the end,…", "/ɪn ði end/", "最后……", "In the end, a passenger helped me."),
        ],
        ("The wrong train", "At first, Lin thought he was on the right train. It turned out that the train was going south. In the end, another passenger showed him where to change.", "起初 Lin 以为自己上对了车，后来发现列车向南行驶。最后一位乘客告诉他在哪里换乘。"),
        "故事需要清楚的时间锚点；At first、then、in the end 能让听者轻松跟上。",
    ),
    "opinions": _content(
        [
            ("From my perspective,…", "/frəm maɪ pərˈspektɪv/", "从我的角度看……", "From my perspective, the shorter plan is more realistic."),
            ("The main reason is that…", "/ðə meɪn ˈriːzən ɪz ðæt/", "主要原因是……", "The main reason is that we have limited time."),
            ("How do you see it?", "/haʊ duː juː siː ɪt/", "你怎么看？", "That's my view. How do you see it?"),
        ],
        ("A better plan", "Lin supports the shorter plan because the team has limited time. He gives one example, acknowledges a drawback, and then asks Maya how she sees it.", "Lin 支持较短的方案，因为团队时间有限。他给出一个例子，也承认一个缺点，然后询问 Maya 的看法。"),
        "自然讨论不是连续输出观点；给理由后主动邀请对方回应，会让交流更合作。",
    ),
    "nuance": _content(
        [
            ("I see where you're coming from.", "/aɪ siː wer jʊr ˈkʌmɪŋ frəm/", "我理解你的出发点。", "I see where you're coming from, but I read the data differently."),
            ("I'm not entirely convinced that…", "/aɪm nɒt ɪnˈtaɪərli kənˈvɪnst/", "我还不完全认同……", "I'm not entirely convinced that speed is the main issue."),
            ("Could we look at another option?", "/kʊd wiː lʊk æt əˈnʌðər ˈɒpʃən/", "我们能看看另一个方案吗？", "Could we look at another option before deciding?"),
        ],
        ("Disagreeing well", "Maya acknowledges Lin's concern before disagreeing. She explains what evidence would change her mind and suggests that they compare one more option.", "Maya 先承认 Lin 的顾虑，再表达不同意见。她说明什么证据能改变自己的看法，并建议再比较一个方案。"),
        "礼貌分歧依靠承认、限定和替代方案；过度道歉反而可能让观点显得含糊。",
    ),
    "professional": _content(
        [
            ("In practical terms,…", "/ɪn ˈpræktɪkəl tɜːrmz/", "具体来说……", "In practical terms, this cuts the review time in half."),
            ("The key distinction is between…", "/ðə kiː dɪˈstɪŋkʃən ɪz bɪˈtwiːn/", "关键区别在于……", "The key distinction is between accuracy and consistency."),
            ("Let me reframe that.", "/let miː ˌriːˈfreɪm ðæt/", "我换个角度解释。", "Let me reframe that with a concrete example."),
        ],
        ("Explaining a system", "Lin begins with the decision the audience needs to make. He distinguishes accuracy from consistency, gives a concrete example, and ends with the practical consequence.", "Lin 先说明听众需要作出的决定，再区分准确性与一致性，给出具体例子，最后落到实际影响。"),
        "专业表达的自然度来自为听众重组信息，而不是堆砌术语；先给结论，再解释结构。",
    ),
    "culture": _content(
        [
            ("That's one way of putting it.", "/ðæts wʌn weɪ əv ˈpʊtɪŋ ɪt/", "也可以这么说（语气取决于上下文）。", "“That's one way of putting it,” Maya said with a small smile."),
            ("Read the room.", "/riːd ðə ruːm/", "观察现场气氛。", "Before making the joke, read the room."),
            ("It landed differently than I expected.", "/ɪt ˈlændɪd ˈdɪfrəntli ðæn aɪ ɪkˈspektɪd/", "产生的效果和预期不同。", "The joke landed differently than I expected."),
        ],
        ("What was really meant", "A comment can be grammatically positive but pragmatically doubtful. Lin listens to the wording, tone, relationship, and situation before deciding how literally to respond.", "一句话在语法上可以是肯定的，但语用上可能表示怀疑。Lin 会结合措辞、语调、关系和场景判断是否按字面回应。"),
        "英语的含蓄常由语调和弱化表达承载；高级理解要同时观察字面、关系和现场反应。",
    ),
}


FRENCH = {
    "greeting": _content(
        [
            ("Bonjour, comment ça va ?", "/bɔ̃.ʒuʁ kɔ.mɑ̃ sa va/", "你好，最近怎么样？", "Bonjour, comment ça va aujourd'hui ?"),
            ("Ça va bien, merci.", "/sa va bjɛ̃ mɛʁ.si/", "我很好，谢谢。", "Ça va bien, merci. Et vous ?"),
            ("À bientôt.", "/a bjɛ̃.to/", "回头见。", "Je dois partir. À bientôt !"),
        ],
        ("Une rencontre", "Nina rencontre Paul avant le cours. Ils se saluent, échangent quelques mots et se disent à bientôt.", "Nina 上课前遇见 Paul。他们互相问候、聊了几句，然后说回头见。"),
        "对陌生人或正式对象使用 vous；熟人之间通常用 tu。",
    ),
    "identity": _content(
        [
            ("Je m'appelle…", "/ʒə ma.pɛl/", "我叫……", "Je m'appelle Lin."),
            ("Je viens de…", "/ʒə vjɛ̃ də/", "我来自……", "Je viens de Canton."),
            ("J'apprends le français.", "/ʒa.pʁɑ̃ lə fʁɑ̃.sɛ/", "我在学法语。", "J'apprends le français pour voyager."),
        ],
        ("Voici Lin", "Je m'appelle Lin et je viens de Canton. J'apprends le français parce que je veux parler avec les gens pendant mes voyages.", "我叫 Lin，来自广州。我学习法语，因为旅行时想和别人交流。"),
        "法语自我介绍中 Je m'appelle… 比直译“我的名字是”更自然。",
    ),
    "numbers": _content(
        [
            ("À quelle heure ça commence ?", "/a kɛl œʁ sa kɔ.mɑ̃s/", "几点开始？", "À quelle heure commence la réunion ?"),
            ("Ça commence à dix-huit heures trente.", "/sa kɔ.mɑ̃s a di.z‿ɥit œʁ tʁɑ̃t/", "十八点三十分开始。", "Le cours commence à dix-huit heures trente."),
            ("Vous pouvez répéter ?", "/vu pu.ve ʁe.pe.te/", "您能重复一下吗？", "Vous pouvez répéter le numéro, s'il vous plaît ?"),
        ],
        ("Confirmer l'heure", "Le cours commence à dix-huit heures trente. Lin note l'heure et demande au professeur de répéter le numéro de la salle.", "课程十八点三十分开始。Lin 记下时间，并请老师重复教室号码。"),
        "法国常用二十四小时制；口语中也会说 six heures et demie。",
    ),
    "food": _content(
        [
            ("Je voudrais…, s'il vous plaît.", "/ʒə vu.dʁɛ sil vu plɛ/", "我想要……", "Je voudrais un café, s'il vous plaît."),
            ("Sans sucre, s'il vous plaît.", "/sɑ̃ sykʁ sil vu plɛ/", "请不要加糖。", "Un café sans sucre, s'il vous plaît."),
            ("Ce sera tout, merci.", "/sə sə.ʁa tu mɛʁ.si/", "就这些，谢谢。", "Ce sera tout, merci."),
        ],
        ("Au café", "Lin commande un café sans sucre et un sandwich. Le serveur confirme la commande. Lin répond : « Ce sera tout, merci. »", "Lin 点了一杯不加糖的咖啡和三明治。服务员确认订单，Lin 表示就这些。"),
        "Je voudrais… 是点餐中稳定、礼貌的表达；不必把每句话都说成完整书面句。",
    ),
    "directions": _content(
        [
            ("Comment aller à… ?", "/kɔ.mɑ̃ a.le a/", "怎么去……？", "Comment aller à la gare ?"),
            ("Allez tout droit, puis tournez à gauche.", "/a.le tu dʁwa pɥi tuʁ.ne a ɡoʃ/", "直走，然后左转。", "Allez tout droit, puis tournez à gauche."),
            ("C'est loin d'ici ?", "/sɛ lwɛ̃ di.si/", "离这里远吗？", "La gare, c'est loin d'ici ?"),
        ],
        ("Trouver la gare", "La gare n'est pas loin. Allez tout droit, tournez à gauche après la banque ; elle est en face du parc.", "车站不远。直走，在银行后左转；车站就在公园对面。"),
        "陌生人问路常用 vous 对应的命令式 allez、tournez。",
    ),
    "routine": _content(
        [
            ("D'habitude, je…", "/da.bi.tyd ʒə/", "我通常……", "D'habitude, je finis à dix-huit heures."),
            ("Tu es libre samedi ?", "/ty ɛ libʁ sa.mə.di/", "你周六有空吗？", "Tu es libre samedi après-midi ?"),
            ("On se retrouve vers quinze heures.", "/ɔ̃ sə ʁə.tʁuv vɛʁ kɛ̃z œʁ/", "我们十五点左右见。", "On se retrouve vers quinze heures devant la bibliothèque."),
        ],
        ("Le week-end", "Nina étudie d'habitude le samedi matin, mais elle est libre après le déjeuner. Elle retrouve Lin vers quinze heures.", "Nina 通常周六早上学习，但午饭后有空。她和 Lin 约在十五点左右见面。"),
        "日常口语中 on 经常代替 nous；vers 表示大约时间。",
    ),
    "problems": _content(
        [
            ("Il y a un problème avec…", "/il i a œ̃ pʁɔ.blɛm a.vɛk/", "……有问题。", "Il y a un problème avec ma réservation."),
            ("Ce dont j'ai besoin, c'est…", "/sə dɔ̃ ʒe bə.zwɛ̃ sɛ/", "我需要的是……", "Ce dont j'ai besoin, c'est d'une chambre calme."),
            ("Vous pouvez m'aider à régler ça ?", "/vu pu.ve mɛ.de a ʁe.ɡle sa/", "您能帮我解决吗？", "Vous pouvez m'aider à régler ça ?"),
        ],
        ("Une erreur de réservation", "La réservation de Lin indique la mauvaise date. Il montre le message de confirmation et demande de déplacer la réservation à vendredi.", "Lin 的预订显示了错误日期。他出示确认信息，并要求把预订改到周五。"),
        "先客观描述问题，再提出具体请求，比直接责备更符合常见服务场景。",
    ),
    "story": _content(
        [
            ("Au début,…", "/o de.by/", "起初……", "Au début, je pensais être dans le bon train."),
            ("Je me suis rendu compte que…", "/ʒə mə sɥi ʁɑ̃.dy kɔ̃t kə/", "我意识到……", "Je me suis rendu compte que j'allais dans la mauvaise direction."),
            ("Finalement,…", "/fi.nal.mɑ̃/", "最后……", "Finalement, un voyageur m'a aidé."),
        ],
        ("Le mauvais train", "Au début, Lin pensait être dans le bon train. Puis il s'est rendu compte de son erreur. Finalement, un voyageur lui a montré où changer.", "起初 Lin 以为上对了车，后来意识到错误。最后一位乘客告诉他在哪里换乘。"),
        "叙事中时态选择服务于前后关系；连接词先保证故事清楚，再追求复杂变化。",
    ),
    "opinions": _content(
        [
            ("De mon point de vue,…", "/də mɔ̃ pwɛ̃ də vy/", "从我的角度看……", "De mon point de vue, le plan court est plus réaliste."),
            ("La raison principale, c'est que…", "/la ʁɛ.zɔ̃ pʁɛ̃.si.pal sɛ kə/", "主要原因是……", "La raison principale, c'est que nous manquons de temps."),
            ("Qu'en pensez-vous ?", "/kɑ̃ pɑ̃.se vu/", "您怎么看？", "Voilà mon avis. Qu'en pensez-vous ?"),
        ],
        ("Choisir un plan", "Lin préfère le plan court parce que l'équipe manque de temps. Il donne un exemple, reconnaît une limite et demande l'avis de Nina.", "Lin 更喜欢短方案，因为团队时间不足。他举例、承认一个局限，再询问 Nina 的意见。"),
        "表达观点时加入 à mon avis、de mon point de vue，可清楚区分事实和个人判断。",
    ),
    "nuance": _content(
        [
            ("Je comprends votre point de vue.", "/ʒə kɔ̃.pʁɑ̃ vɔtʁ pwɛ̃ də vy/", "我理解您的观点。", "Je comprends votre point de vue, mais j'interprète les chiffres autrement."),
            ("Je ne suis pas tout à fait convaincu que…", "/ʒə nə sɥi pa tu ta fɛ kɔ̃.vɛ̃.ky/", "我还不完全认同……", "Je ne suis pas tout à fait convaincu que la vitesse soit le vrai problème."),
            ("On pourrait examiner une autre option ?", "/ɔ̃ pu.ʁɛ ɛɡ.za.mi.ne yn otʁ ɔp.sjɔ̃/", "我们可以看看另一个方案吗？", "On pourrait examiner une autre option avant de décider ?"),
        ],
        ("Un désaccord utile", "Nina reconnaît l'inquiétude de Lin, explique son désaccord et propose de comparer une autre option avant de décider.", "Nina 承认 Lin 的担忧，解释不同意见，并提议决定前比较另一个方案。"),
        "法语正式讨论常用条件式 pourrait、voudrais 来降低请求或反对的强度。",
    ),
    "professional": _content(
        [
            ("Concrètement,…", "/kɔ̃.kʁɛt.mɑ̃/", "具体来说……", "Concrètement, cette méthode réduit le temps de moitié."),
            ("La distinction essentielle se situe entre…", "/la dis.tɛ̃k.sjɔ̃ e.sɑ̃.sjɛl sə si.ty ɑ̃tʁ/", "关键区别在于……", "La distinction essentielle se situe entre précision et cohérence."),
            ("Permettez-moi de reformuler.", "/pɛʁ.mɛ.te mwa də ʁə.fɔʁ.my.le/", "请允许我换个方式说明。", "Permettez-moi de reformuler avec un exemple concret."),
        ],
        ("Expliquer clairement", "Lin commence par la décision à prendre, distingue deux notions proches, donne un exemple concret et termine par la conséquence pratique.", "Lin 从需要作出的决定开始，区分两个相近概念，给出具体例子，最后说明实际影响。"),
        "专业法语重视结构标记；换一种说法是照顾听众，不代表原来的表达失败。",
    ),
    "culture": _content(
        [
            ("C'est une façon de voir les choses.", "/sɛ tyn fa.sɔ̃ də vwaʁ le ʃoz/", "这是一种看法（可表示保留）。", "« C'est une façon de voir les choses », répond Nina."),
            ("Il faut sentir l'ambiance.", "/il fo sɑ̃.tiʁ lɑ̃.bjɑ̃s/", "要感受现场气氛。", "Avant de plaisanter, il faut sentir l'ambiance."),
            ("La remarque n'a pas eu l'effet prévu.", "/la ʁə.maʁk na pa y le.fɛ pʁe.vy/", "这句话没有产生预期效果。", "La remarque n'a pas eu l'effet prévu."),
        ],
        ("Entre les lignes", "Une phrase polie peut exprimer une réserve. Lin observe les mots, l'intonation, la relation et la réaction du groupe avant de répondre.", "一句礼貌的话也可能表达保留。Lin 会观察措辞、语调、关系和群体反应后再回应。"),
        "高级理解包含读懂 sous-entendu（言外之意）；语调与关系决定一句话是同意、保留还是讽刺。",
    ),
}


JAPANESE = {
    "greeting": _content(
        [
            ("こんにちは", "こんにちは", "你好。", "こんにちは。お元気ですか。"),
            ("元気です、ありがとう", "げんきです、ありがとう", "我很好，谢谢。", "元気です、ありがとうございます。"),
            ("またあとで", "またあとで", "待会儿见。", "では、またあとで。"),
        ],
        ("短いあいさつ", "授業の前に、リンさんはミカさんに会いました。二人はあいさつをして、またあとで話すことにしました。", "上课前，Lin 遇见 Mika。两人互相问候，并约好稍后再聊。"),
        "日语问候取决于时间、关系和场合；礼貌体 です／ます 是初学者安全的默认选择。",
    ),
    "identity": _content(
        [
            ("私は…です", "わたしは…です", "我是……", "私はリンです。"),
            ("…から来ました", "…からきました", "我来自……", "広州から来ました。"),
            ("日本語を勉強しています", "にほんごをべんきょうしています", "我在学习日语。", "旅行のために日本語を勉強しています。"),
        ],
        ("リンさんの自己紹介", "私はリンです。広州から来ました。今、日本語を勉強しています。旅行で日本語を使いたいです。", "我是 Lin，来自广州。现在正在学日语，希望旅行时使用日语。"),
        "自我介绍常以 はじめまして 开始，以 どうぞよろしくお願いします 结束。",
    ),
    "numbers": _content(
        [
            ("何時に始まりますか", "なんじにはじまりますか", "几点开始？", "会議は何時に始まりますか。"),
            ("六時半に始まります", "ろくじはんにはじまります", "六点半开始。", "授業は六時半に始まります。"),
            ("もう一度お願いします", "もういちどおねがいします", "请再说一次。", "番号をもう一度お願いします。"),
        ],
        ("時間を確認する", "授業は六時半に始まります。リンさんは時間を書いて、教室の番号をもう一度聞きました。", "课程六点半开始。Lin 写下时间，并再次询问教室号码。"),
        "数字会随对象使用不同计数法；先掌握时间、价格和电话号码的高频读法。",
    ),
    "food": _content(
        [
            ("…をお願いします", "…をおねがいします", "请给我……", "コーヒーをお願いします。"),
            ("砂糖なしでお願いします", "さとうなしでおねがいします", "请不要加糖。", "砂糖なしでお願いします。"),
            ("以上です", "いじょうです", "就这些。", "注文は以上です。ありがとうございます。"),
        ],
        ("カフェで", "リンさんは砂糖なしのコーヒーとサンドイッチを注文しました。店員が確認すると、リンさんは「以上です」と答えました。", "Lin 点了不加糖的咖啡和三明治。店员确认后，Lin 表示就这些。"),
        "点餐可用 ください，但 お願いします 在许多服务场景更柔和。",
    ),
    "directions": _content(
        [
            ("…へはどう行きますか", "…へはどういきますか", "怎么去……？", "駅へはどう行きますか。"),
            ("まっすぐ行って、左に曲がってください", "まっすぐいって、ひだりにまがってください", "直走，然后左转。", "まっすぐ行って、銀行で左に曲がってください。"),
            ("ここから遠いですか", "ここからとおいですか", "离这里远吗？", "駅はここから遠いですか。"),
        ],
        ("駅までの道", "駅は遠くありません。二つ目の角までまっすぐ行って、銀行のところで左に曲がります。駅は公園の向かいです。", "车站不远。直走到第二个路口，在银行处左转，车站在公园对面。"),
        "日语路线说明常连续使用 て形；先抓地标 + 动作。",
    ),
    "routine": _content(
        [
            ("普段は…", "ふだんは…", "平时通常……", "普段は六時に仕事が終わります。"),
            ("土曜日は空いていますか", "どようびはあいていますか", "周六有空吗？", "土曜日の午後は空いていますか。"),
            ("三時ごろ会いましょう", "さんじごろあいましょう", "三点左右见吧。", "図書館の前で三時ごろ会いましょう。"),
        ],
        ("週末の予定", "ミカさんは土曜日の午前中に勉強しますが、午後は空いています。二人は三時ごろ図書館の前で会います。", "Mika 周六上午学习，但下午有空。两人约在三点左右在图书馆前见面。"),
        "ごろ 表示大约时间；约定后常再复述地点和时间确认。",
    ),
    "problems": _content(
        [
            ("…に問題があります", "…にもんだいがあります", "……有问题。", "予約に問題があります。"),
            ("必要なのは…です", "ひつようなのは…です", "需要的是……", "必要なのは静かな部屋です。"),
            ("対応していただけますか", "たいおうしていただけますか", "能帮忙处理吗？", "この件に対応していただけますか。"),
        ],
        ("予約の問題", "リンさんの予約は日付が間違っていました。確認メールを見せて、金曜日に変更できるか聞きました。", "Lin 的预订日期错了。他出示确认邮件，并询问能否改到周五。"),
        "服务场景中先说明事实，再用 〜ていただけますか 提出请求，可避免语气过强。",
    ),
    "story": _content(
        [
            ("最初は…", "さいしょは…", "起初……", "最初は正しい電車だと思いました。"),
            ("ところが…", "ところが…", "然而……", "ところが、反対方向に進んでいました。"),
            ("結局…", "けっきょく…", "最终……", "結局、乗客が助けてくれました。"),
        ],
        ("反対方向の電車", "最初は正しい電車だと思いました。ところが、電車は反対方向に進んでいました。結局、近くの乗客が乗り換え方を教えてくれました。", "起初以为上对了车，然而列车向相反方向行驶。最后附近的乘客告诉我如何换乘。"),
        "日语叙事常省略已知主语；连接词和视点一致性比反复说 私 更自然。",
    ),
    "opinions": _content(
        [
            ("私の考えでは…", "わたしのかんがえでは…", "在我看来……", "私の考えでは、短い計画のほうが現実的です。"),
            ("一番の理由は…", "いちばんのりゆうは…", "最主要的理由是……", "一番の理由は、時間が限られていることです。"),
            ("どう思いますか", "どうおもいますか", "你怎么看？", "私はそう考えますが、どう思いますか。"),
        ],
        ("計画について話す", "リンさんは短い計画を支持しています。理由と具体例を説明し、弱点も認めたうえで、ミカさんの意見を聞きました。", "Lin 支持短方案。他说明理由和例子，也承认弱点，然后询问 Mika 的意见。"),
        "〜と思います 能把判断标记为个人看法；讨论中应给对方留出回应空间。",
    ),
    "nuance": _content(
        [
            ("おっしゃることは分かります", "おっしゃることはわかります", "我理解您说的意思。", "おっしゃることは分かりますが、別の見方もあると思います。"),
            ("必ずしも…とは思いません", "かならずしも…とはおもいません", "我不认为一定……", "速さだけが問題だとは必ずしも思いません。"),
            ("別の案も検討しませんか", "べつのあんもけんとうしませんか", "要不要也考虑另一个方案？", "決める前に、別の案も検討しませんか。"),
        ],
        ("意見が違うとき", "ミカさんは相手の懸念を認めてから、違う見方を説明しました。そして、決定前に別の案も比べることを提案しました。", "Mika 先承认对方的顾虑，再说明不同视角，并提议决定前比较其他方案。"),
        "日语分歧常通过部分同意、否定范围和提案表达；含糊不等于礼貌，关键是让立场仍可理解。",
    ),
    "professional": _content(
        [
            ("具体的には…", "ぐたいてきには…", "具体来说……", "具体的には、確認時間を半分にできます。"),
            ("重要な違いは…", "じゅうようなちがいは…", "重要区别在于……", "重要な違いは、正確さと一貫性です。"),
            ("別の言い方をします", "べつのいいかたをします", "我换一种说法。", "具体例を使って、別の言い方をします。"),
        ],
        ("仕組みを説明する", "リンさんは最初に結論を示し、二つの概念の違いを説明しました。次に具体例を出し、最後に実務上の影響をまとめました。", "Lin 先给结论，解释两个概念的区别，再举具体例子，最后总结实际影响。"),
        "专业日语需要清楚的结构标记和对听众的敬意；难词不等于高级表达。",
    ),
    "culture": _content(
        [
            ("そういう見方もありますね", "そういうみかたもありますね", "也有这种看法（可能有所保留）。", "そういう見方もありますね、とミカさんは答えました。"),
            ("場の空気を読む", "ばのくうきをよむ", "读懂现场气氛。", "冗談を言う前に、場の空気を読みます。"),
            ("思ったようには伝わりませんでした", "おもったようにはつたわりませんでした", "没有按预想传达出去。", "冗談は思ったようには伝わりませんでした。"),
        ],
        ("言葉の外にある意味", "丁寧な表現でも、賛成とは限りません。言葉、間、声の調子、関係、周りの反応を合わせて判断する必要があります。", "即使表达很礼貌，也不一定表示同意。需要结合词语、停顿、语调、关系和周围反应判断。"),
        "高阶自然度来自语域、间（ま）和关系判断；不要把所有含蓄表达机械翻译成同意。",
    ),
}


KOREAN = {
    "greeting": _content(
        [
            ("안녕하세요?", "annyeonghaseyo", "您好。", "안녕하세요? 오늘 잘 지내세요?"),
            ("잘 지내요, 감사합니다.", "jal jinaeyo, gamsahamnida", "我很好，谢谢。", "네, 잘 지내요. 감사합니다."),
            ("나중에 봐요.", "najunge bwayo", "待会儿见。", "그럼 나중에 봐요."),
        ],
        ("짧은 인사", "수업 전에 린은 민지를 만났어요. 두 사람은 인사하고 나중에 다시 이야기하기로 했어요.", "上课前 Lin 遇见 Minji。两人互相问候，并约好稍后再聊。"),
        "初学者使用 -요 体能覆盖大多数礼貌日常场景；关系更正式时需要更高敬语。",
    ),
    "identity": _content(
        [
            ("저는 …예요.", "jeoneun …yeyo", "我是……", "저는 린이에요."),
            ("…에서 왔어요.", "…eseo wasseoyo", "我来自……", "광저우에서 왔어요."),
            ("한국어를 공부하고 있어요.", "hangugeoreul gongbuhago isseoyo", "我在学习韩语。", "여행을 위해 한국어를 공부하고 있어요."),
        ],
        ("린의 자기소개", "저는 린이에요. 광저우에서 왔어요. 지금 한국어를 공부하고 있고, 여행할 때 한국어로 이야기하고 싶어요.", "我是 Lin，来自广州。现在正在学习韩语，希望旅行时用韩语交流。"),
        "이에요/예요 根据前一个词是否有收音变化；实际对话中可先固定练习自己的姓名。",
    ),
    "numbers": _content(
        [
            ("몇 시에 시작해요?", "myeot sie sijakhaeyo", "几点开始？", "회의는 몇 시에 시작해요?"),
            ("여섯 시 반에 시작해요.", "yeoseot si bane sijakhaeyo", "六点半开始。", "수업은 여섯 시 반에 시작해요."),
            ("다시 말씀해 주세요.", "dasi malsseumhae juseyo", "请再说一次。", "번호를 다시 말씀해 주세요."),
        ],
        ("시간 확인", "수업은 여섯 시 반에 시작해요. 린은 시간을 적고 교실 번호를 다시 물어봤어요.", "课程六点半开始。Lin 记下时间，并再次询问教室号码。"),
        "韩语同时使用固有数词和汉字数词；时间的“点”通常用固有数词，“分”用汉字数词。",
    ),
    "food": _content(
        [
            ("… 주세요.", "… juseyo", "请给我……", "커피 한 잔 주세요."),
            ("설탕은 빼 주세요.", "seoltangeun ppae juseyo", "请不要放糖。", "설탕은 빼 주세요."),
            ("이게 다예요. 감사합니다.", "ige dayeyo, gamsahamnida", "就这些，谢谢。", "이게 다예요. 감사합니다."),
        ],
        ("카페에서", "린은 설탕 없는 커피와 샌드위치를 주문했어요. 직원이 주문을 확인하자 린은 이게 다라고 말했어요.", "Lin 点了不加糖的咖啡和三明治。店员确认订单后，Lin 表示就这些。"),
        "주세요 是高频请求形式；服务场景中数量单位也很重要，如 잔、개、명。",
    ),
    "directions": _content(
        [
            ("…에 어떻게 가요?", "…e eotteoke gayo", "怎么去……？", "역에 어떻게 가요?"),
            ("쭉 가서 왼쪽으로 도세요.", "jjuk gaseo oenjjogeuro doseyo", "直走然后左转。", "쭉 가서 은행에서 왼쪽으로 도세요."),
            ("여기서 멀어요?", "yeogiseo meoreoyo", "离这里远吗？", "역은 여기서 멀어요?"),
        ],
        ("역 찾기", "역은 멀지 않아요. 두 블록 쭉 가서 은행에서 왼쪽으로 도세요. 역은 공원 맞은편에 있어요.", "车站不远。直走两个街区，在银行左转，车站在公园对面。"),
        "路线中 -아서/어서 可自然连接连续动作；地标常和 에서 一起标记转向地点。",
    ),
    "routine": _content(
        [
            ("보통은…", "botongeun…", "通常……", "보통은 여섯 시에 일이 끝나요."),
            ("토요일에 시간 있어요?", "toyoire sigan isseoyo", "周六有空吗？", "토요일 오후에 시간 있어요?"),
            ("세 시쯤 만나요.", "se sijjeum mannayo", "三点左右见吧。", "도서관 앞에서 세 시쯤 만나요."),
        ],
        ("주말 약속", "민지는 토요일 오전에 공부하지만 점심 후에는 시간이 있어요. 두 사람은 세 시쯤 도서관 앞에서 만나기로 했어요.", "Minji 周六上午学习，但午饭后有空。两人约在三点左右在图书馆前见。"),
        "쯤 表示大约；약속을 잡다 是“约时间”的常用搭配。",
    ),
    "problems": _content(
        [
            ("…에 문제가 있어요.", "…e munjega isseoyo", "……有问题。", "예약에 문제가 있어요."),
            ("제가 필요한 건…", "jega piryohan geon…", "我需要的是……", "제가 필요한 건 조용한 방이에요."),
            ("이 문제를 해결해 주실 수 있어요?", "i munjereul haegyeolhae jusil su isseoyo", "能帮我解决吗？", "이 문제를 해결해 주실 수 있어요?"),
        ],
        ("예약 문제", "린의 예약 날짜가 잘못되어 있었어요. 린은 확인 메시지를 보여 주고 금요일로 바꿀 수 있는지 물었어요.", "Lin 的预订日期有误。他出示确认信息，并询问能否改到周五。"),
        "주실 수 있어요? 比直接命令更适合向服务人员提出需要处理的请求。",
    ),
    "story": _content(
        [
            ("처음에는…", "cheoeumeneun…", "起初……", "처음에는 맞는 기차인 줄 알았어요."),
            ("알고 보니…", "algo boni…", "后来发现……", "알고 보니 반대 방향으로 가고 있었어요."),
            ("결국…", "gyeolguk…", "最终……", "결국 한 승객이 도와줬어요."),
        ],
        ("반대 방향 기차", "처음에는 맞는 기차인 줄 알았어요. 알고 보니 반대 방향이었어요. 결국 옆에 있던 승객이 갈아타는 곳을 알려 줬어요.", "起初以为上对了车，后来发现方向相反。最后旁边的乘客告诉我在哪里换乘。"),
        "알고 보니 很适合表达“后来才发现”；讲故事时保持句尾体一致会更自然。",
    ),
    "opinions": _content(
        [
            ("제 관점에서는…", "je gwanjeomeseoneun…", "从我的角度看……", "제 관점에서는 짧은 계획이 더 현실적이에요."),
            ("가장 큰 이유는…", "gajang keun iyuneun…", "最主要的原因是……", "가장 큰 이유는 시간이 부족하기 때문이에요."),
            ("어떻게 생각하세요?", "eotteoke saenggakhaseyo", "您怎么看？", "저는 이렇게 생각하는데, 어떻게 생각하세요?"),
        ],
        ("계획 선택", "린은 시간이 부족하기 때문에 짧은 계획을 지지해요. 예를 하나 들고 한계도 인정한 뒤 민지의 의견을 물어요.", "Lin 因时间不足支持短方案。他举例、承认局限，再询问 Minji 的意见。"),
        "观点后加 이유와 예를 들면 更有说服力；最后提问能避免讨论变成单向陈述。",
    ),
    "nuance": _content(
        [
            ("무슨 말씀인지 이해해요.", "museun malsseuminji ihaehaeyo", "我理解您的意思。", "무슨 말씀인지 이해하지만, 저는 자료를 다르게 봐요."),
            ("꼭 …라고 생각하지는 않아요.", "kkok …rago saenggakhajineun anayo", "我不认为一定……", "속도만이 문제라고 생각하지는 않아요."),
            ("다른 방법도 검토해 볼까요?", "dareun bangbeopdo geomtohae bolkkayo", "也看看其他方法吗？", "결정하기 전에 다른 방법도 검토해 볼까요?"),
        ],
        ("생산적인 반대", "민지는 상대의 걱정을 인정한 뒤 다른 해석을 설명했어요. 그리고 결정 전에 다른 방법을 비교하자고 제안했어요.", "Minji 承认对方的担心，再解释不同解读，并提议决定前比较其他方法。"),
        "韩语常用 -기는 하지만、-지는 않다 限定不同意见，既清楚又不过度正面冲突。",
    ),
    "professional": _content(
        [
            ("실제로는…", "siljeroneun…", "具体到实践中……", "실제로는 검토 시간을 절반으로 줄일 수 있어요."),
            ("핵심적인 차이는…", "haeksimjeogin chaineun…", "核心区别是……", "핵심적인 차이는 정확성과 일관성이에요."),
            ("다른 방식으로 설명해 보겠습니다.", "dareun bangsigeuro seolmyeonghae bogetseumnida", "我换个方式说明。", "구체적인 예로 다시 설명해 보겠습니다."),
        ],
        ("복잡한 내용 설명", "린은 먼저 결론을 제시하고 비슷한 두 개념을 구분했어요. 구체적인 예를 든 뒤 실무에 미치는 영향을 정리했어요.", "Lin 先给结论，区分两个相近概念，举具体例子，最后总结对实际工作的影响。"),
        "正式说明常切换到 -습니다 体；先面向听众重组信息，再选择术语。",
    ),
    "culture": _content(
        [
            ("그렇게 볼 수도 있겠네요.", "geureoke bol sudo itgenneyo", "也可以这么看（可能有所保留）。", "민지는 그렇게 볼 수도 있겠다고 답했어요."),
            ("분위기를 살피다", "bunwigireul salpida", "观察现场气氛。", "농담하기 전에 분위기를 살펴야 해요."),
            ("생각과 다르게 받아들여졌어요.", "saenggakgwa dareuge badadeuryeojyeosseoyo", "被以不同于预期的方式理解了。", "농담이 생각과 다르게 받아들여졌어요."),
        ],
        ("말 너머의 뜻", "문장이 공손해도 완전한 동의는 아닐 수 있어요. 표현, 억양, 관계와 주변 반응을 함께 보고 의미를 판단해야 해요.", "即使句子很礼貌，也未必完全同意。需要结合表达、语调、关系和周围反应判断含义。"),
        "눈치 和 분위기 影响自然回应；高阶学习要理解话语在关系中的作用，而不仅是字面。",
    ),
}


CANTONESE = {
    "greeting": _content(
        [
            ("你好，最近點呀？", "nei5 hou2, zeoi3 gan6 dim2 aa3", "你好，最近怎么样？", "你好，最近點呀？"),
            ("幾好呀，多謝。", "gei2 hou2 aa3, do1 ze6", "挺好的，谢谢。", "我幾好呀，多謝。你呢？"),
            ("遲啲見。", "ci4 di1 gin3", "晚点见。", "我行先喇，遲啲見。"),
        ],
        ("課前打招呼", "上堂之前，阿琳見到阿明。佢哋打個招呼，傾咗兩句，就話遲啲再見。", "上课前，阿琳遇见阿明。他们互相问候、聊了两句，然后说稍后再见。"),
        "粤语句末语气词会改变自然度和态度；呀、喇在初级日常对话中非常常见。",
    ),
    "identity": _content(
        [
            ("我叫……", "ngo5 giu3", "我叫……", "我叫阿琳。"),
            ("我由……嚟。", "ngo5 jau4 … lai4", "我从……来。", "我由廣州嚟。"),
            ("我學緊廣東話。", "ngo5 hok6 gan2 gwong2 dung1 waa2", "我正在学粤语。", "我為咗旅行學緊廣東話。"),
        ],
        ("阿琳介紹自己", "我叫阿琳，由廣州嚟。我而家學緊廣東話，希望旅行嗰陣可以同人傾偈。", "我叫阿琳，来自广州。现在正在学粤语，希望旅行时能和别人聊天。"),
        "口语进行体常用 緊；傾偈 比“谈话”的书面表达更日常。",
    ),
    "numbers": _content(
        [
            ("幾點開始呀？", "gei2 dim2 hoi1 ci2 aa3", "几点开始？", "個會幾點開始呀？"),
            ("六點半開始。", "luk6 dim2 bun3 hoi1 ci2", "六点半开始。", "堂課六點半開始。"),
            ("可唔可以講多次？", "ho2 m4 ho2 ji5 gong2 do1 ci3", "可以再说一次吗？", "個號碼可唔可以講多次？"),
        ],
        ("確認時間", "堂課六點半開始。阿琳寫低時間，再請老師講多次課室號碼。", "课程六点半开始。阿琳记下时间，再请老师重复教室号码。"),
        "粤语疑问常用 可唔可以、係咪 等正反形式；确认数字时最好复述一次。",
    ),
    "food": _content(
        [
            ("唔該，我想要……", "m4 goi1, ngo5 soeng2 jiu3", "劳驾，我想要……", "唔該，我想要杯咖啡。"),
            ("走糖，唔該。", "zau2 tong2, m4 goi1", "不加糖，谢谢。", "杯咖啡走糖，唔該。"),
            ("係咁多，多謝。", "hai6 gam3 do1, do1 ze6", "就这些，谢谢。", "係咁多，多謝。"),
        ],
        ("喺茶餐廳", "阿琳叫咗杯走糖咖啡同一份三文治。侍應確認之後，佢話：「係咁多，多謝。」", "阿琳点了一杯不加糖的咖啡和一份三明治。服务员确认后，她说就这些。"),
        "唔該 多用于劳驾、服务或收到小帮助；多謝 更偏向感谢礼物或较大的帮助。",
    ),
    "directions": _content(
        [
            ("去……點行呀？", "heoi3 … dim2 haang4 aa3", "去……怎么走？", "去地鐵站點行呀？"),
            ("直行，跟住轉左。", "zik6 haang4, gan1 zyu6 zyun2 zo2", "直走，然后左转。", "直行兩個街口，跟住喺銀行轉左。"),
            ("離呢度遠唔遠？", "lei4 ni1 dou6 jyun5 m4 jyun5", "离这里远不远？", "地鐵站離呢度遠唔遠？"),
        ],
        ("搵地鐵站", "地鐵站唔遠。直行兩個街口，喺銀行轉左，地鐵站就喺公園對面。", "地铁站不远。直走两个街口，在银行左转，地铁站就在公园对面。"),
        "跟住 是叙述步骤的高频连接词；方位常配合 喺、對面、隔籬。",
    ),
    "routine": _content(
        [
            ("我平時……", "ngo5 ping4 si4", "我平时……", "我平時六點收工。"),
            ("你星期六得唔得閒？", "nei5 sing1 kei4 luk6 dak1 m4 dak1 haan4", "你星期六有空吗？", "你星期六下晝得唔得閒？"),
            ("不如三點左右見。", "bat1 jyu4 saam1 dim2 zo2 jau6 gin3", "不如三点左右见。", "不如三點左右喺圖書館門口見。"),
        ],
        ("週末約人", "阿明平時星期六朝早溫書，下晝就得閒。佢同阿琳約咗三點左右喺圖書館門口見。", "阿明通常周六早上复习，下午有空。他和阿琳约在三点左右在图书馆门口见。"),
        "不如 用于自然提出建议；得閒 是“有空”的常用口语表达。",
    ),
    "problems": _content(
        [
            ("……有啲問題。", "… jau5 di1 man6 tai4", "……有点问题。", "我個預訂有啲問題。"),
            ("我需要嘅係……", "ngo5 seoi1 jiu3 ge3 hai6", "我需要的是……", "我需要嘅係一間靜啲嘅房。"),
            ("可唔可以幫我搞掂？", "ho2 m4 ho2 ji5 bong1 ngo5 gaau2 dim6", "可以帮我处理好吗？", "呢件事可唔可以幫我搞掂？"),
        ],
        ("預訂出錯", "阿琳個預訂日期錯咗。佢畀職員睇確認電郵，再問可唔可以改到星期五。", "阿琳的预订日期错了。她给职员看确认邮件，再问能否改到周五。"),
        "搞掂 很口语；更正式可说 處理。先说明问题再讲希望结果，沟通会更顺。",
    ),
    "story": _content(
        [
            ("一開始……", "jat1 hoi1 ci2", "一开始……", "一開始，我以為自己上啱車。"),
            ("點知……", "dim2 zi1", "谁知道／没想到……", "點知架車向相反方向行。"),
            ("最後……", "zeoi3 hau6", "最后……", "最後有個乘客幫咗我。"),
        ],
        ("搭錯車", "一開始，我以為自己上啱車。點知架車向相反方向行。最後，隔籬個乘客話我知去邊度轉車。", "一开始我以为上对了车，没想到车往相反方向走。最后旁边的乘客告诉我去哪里换乘。"),
        "點知 带有出乎意料的叙事效果，是粤语口语故事中很自然的转折。",
    ),
    "opinions": _content(
        [
            ("喺我角度睇……", "hai2 ngo5 gok3 dou6 tai2", "从我的角度看……", "喺我角度睇，短啲嘅方案實際啲。"),
            ("最主要嘅原因係……", "zeoi3 zyu2 jiu3 ge3 jyun4 jan1 hai6", "最主要的原因是……", "最主要嘅原因係時間有限。"),
            ("你又點睇？", "nei5 jau6 dim2 tai2", "你又怎么看？", "呢個係我嘅睇法，你又點睇？"),
        ],
        ("揀一個方案", "阿琳支持短啲嘅方案，因為團隊時間有限。佢舉咗一個例，亦承認方案有不足，之後問阿明點睇。", "阿琳支持较短的方案，因为团队时间有限。她举例并承认不足，然后询问阿明怎么看。"),
        "粤语讨论中 睇法、點睇 很自然；讲完理由后把话轮交给对方。",
    ),
    "nuance": _content(
        [
            ("我明你點解咁諗。", "ngo5 ming4 nei5 dim2 gaai2 gam2 nam2", "我明白你为什么这样想。", "我明你點解咁諗，不過我對啲數據有另一個理解。"),
            ("我又唔係完全認同……", "ngo5 jau6 m4 hai6 jyun4 cyun4 jing6 tung4", "我又不完全认同……", "我又唔係完全認同速度係最大問題。"),
            ("不如睇埋另一個方案？", "bat1 jyu4 tai2 maai4 ling6 jat1 go3 fong1 on3", "不如也看看另一个方案？", "決定之前，不如睇埋另一個方案？"),
        ],
        ("有分歧都可以傾", "阿明先表示明白對方嘅擔心，再解釋自己唔同意嘅地方，最後提議決定前睇多一個方案。", "阿明先表示理解对方的担忧，再解释不同意之处，最后提议决定前多看一个方案。"),
        "又唔係、未必、可能 等限制词可以降低冲突，但立场仍要说清楚。",
    ),
    "professional": _content(
        [
            ("實際上……", "sat6 zai3 soeng6", "实际上／具体来说……", "實際上，呢個方法可以慳一半檢查時間。"),
            ("最關鍵嘅分別係……", "zeoi3 gwaan1 gin6 ge3 fan1 bit6 hai6", "最关键的区别是……", "最關鍵嘅分別係準確同一致。"),
            ("等我換個講法。", "dang2 ngo5 wun6 go3 gong2 faat3", "我换个说法。", "等我用一個實例換個講法。"),
        ],
        ("解釋一套系統", "阿琳先講聽眾要做嘅決定，再分清兩個相近概念，跟住用實例解釋，最後講實際影響。", "阿琳先说听众要做的决定，再区分两个相近概念，然后举例解释，最后说明实际影响。"),
        "专业粤语会在口语与书面词之间切换；重点是因应听众选择词语，而不是刻意全用书面语。",
    ),
    "culture": _content(
        [
            ("都可以咁講嘅。", "dou1 ho2 ji5 gam2 gong2 ge3", "也可以这么说（可能有所保留）。", "阿明笑一笑話：「都可以咁講嘅。」"),
            ("睇吓場合先。", "tai2 haa5 coeng4 hap6 sin1", "先看看场合。", "講笑之前要睇吓場合先。"),
            ("個效果同我預期唔同。", "go3 haau6 gwo2 tung4 ngo5 jyu6 kei4 m4 tung4", "效果和预期不同。", "個笑話嘅效果同我預期唔同。"),
        ],
        ("聽出弦外之音", "一句說話表面上同意，實際上可能有保留。要一齊睇用字、語氣、關係同其他人嘅反應。", "一句话表面同意，实际上可能有所保留。要结合用词、语气、关系和其他人的反应。"),
        "粤语语气词、停顿和声调共同承载态度；高级理解不能只看字面字幕。",
    ),
}


PACK_META = {
    "en-US": {
        "id": "en-core-zh",
        "code": "en",
        "name": "英语完整起步",
        "script": "拉丁字母 · IPA",
        "pronunciation_scheme": "ipa",
        "content": ENGLISH,
    },
    "fr-FR": {
        "id": "fr-core-zh",
        "code": "fr",
        "name": "法语完整起步",
        "script": "拉丁字母 · IPA",
        "pronunciation_scheme": "ipa",
        "content": FRENCH,
    },
    "ja-JP": {
        "id": "ja-core-zh",
        "code": "ja",
        "name": "日语完整起步",
        "script": "假名 · 汉字",
        "pronunciation_scheme": "kana",
        "content": JAPANESE,
    },
    "ko-KR": {
        "id": "ko-core-zh",
        "code": "ko",
        "name": "韩语完整起步",
        "script": "韩文",
        "pronunciation_scheme": "hangul",
        "content": KOREAN,
    },
    "yue-Hant-HK": {
        "id": "yue-core-zh",
        "code": "yue",
        "name": "粤语完整起步",
        "script": "繁体中文 · 粤拼",
        "pronunciation_scheme": "jyutping",
        "content": CANTONESE,
    },
}


def _build_legacy_pack(language_tag: str, meta: dict[str, Any]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    for stage_index, stage in enumerate(STAGES):
        lessons: list[dict[str, Any]] = []
        for lesson_index, (scenario, title, can_do) in enumerate(stage["scenarios"]):
            content = meta["content"][scenario]
            phrases = deepcopy(content["phrases"])
            dialogue = [
                {
                    "speaker": "A",
                    "text": phrases[0]["example"],
                    "translation": phrases[0]["meaning"],
                },
                {
                    "speaker": "B",
                    "text": phrases[1]["example"],
                    "translation": phrases[1]["meaning"],
                },
            ]
            lesson_id = f"{meta['code']}-{stage['id']}-{scenario}"
            lessons.append(
                {
                    "id": lesson_id,
                    "order": stage_index * 2 + lesson_index + 1,
                    "stage_id": stage["id"],
                    "level": stage["level"],
                    "title": title,
                    "scenario": scenario,
                    "can_do": can_do,
                    "estimated_minutes": 15,
                    "phrases": phrases,
                    "dialogue": dialogue,
                    "passage": deepcopy(content["passage"]),
                    "listening": {
                        "prompt": "播放后，选择你听到的核心表达。",
                        "text": phrases[1]["term"],
                        "answer": phrases[1]["term"],
                        "choices": [phrase["term"] for phrase in phrases],
                    },
                    "shadowing": {
                        "text": dialogue[0]["text"],
                        "translation": dialogue[0]["translation"],
                    },
                    "output": {
                        "prompt": f"在“{title}”场景中，用目标语言完成一次属于你的表达。",
                        "scaffold": [phrase["term"] for phrase in phrases],
                    },
                    "culture_note": content["culture_note"],
                }
            )
        stages.append(
            {
                "id": stage["id"],
                "level": stage["level"],
                "title": stage["title"],
                "can_do": stage["can_do"],
                "lessons": lessons,
            }
        )
    return {
        "id": meta["id"],
        "version": PACK_VERSION,
        "language_tag": language_tag,
        "name": meta["name"],
        "script": meta["script"],
        "pronunciation_scheme": meta["pronunciation_scheme"],
        "stages": stages,
    }


PHASES = (
    ("discover", "认识", "full", 12),
    ("practice", "强化", "guided", 15),
    ("mission", "实战", "minimal", 18),
)


def _spiral_dialogue(
    phrases: list[dict[str, str]], phase_index: int
) -> list[dict[str, str]]:
    first = phase_index % len(phrases)
    second = (phase_index + 1) % len(phrases)
    return [
        {
            "speaker": "A",
            "text": phrases[first]["example"],
            "translation": phrases[first]["meaning"],
        },
        {
            "speaker": "B",
            "text": phrases[second]["example"],
            "translation": phrases[second]["meaning"],
        },
    ]


def _scenario_lesson(
    *,
    meta: dict[str, Any],
    stage: dict[str, Any],
    stage_index: int,
    unit_index: int,
    scenario: str,
    title: str,
    can_do: str,
    phase_index: int,
) -> dict[str, Any]:
    lesson_type, phase_title, support_level, minutes = PHASES[phase_index]
    content = meta["content"][scenario]
    phrases = deepcopy(content["phrases"])
    dialogue = _spiral_dialogue(phrases, phase_index)
    unit_id = f"{meta['code']}-{stage['id']}-{scenario}"
    lesson_id = unit_id if lesson_type == "discover" else f"{unit_id}-{lesson_type}"
    focus_phrase = phrases[(phase_index + 1) % len(phrases)]
    scaffold_count = {"full": 3, "guided": 2, "minimal": 1}[support_level]
    return {
        "id": lesson_id,
        "unit_id": unit_id,
        "order": stage_index * 7 + unit_index * 3 + phase_index + 1,
        "stage_id": stage["id"],
        "level": stage["level"],
        "title": title if lesson_type == "discover" else f"{title} · {phase_title}",
        "scenario": scenario,
        "lesson_type": lesson_type,
        "support_level": support_level,
        "mastery_threshold": 80,
        "can_do": can_do,
        "estimated_minutes": minutes,
        "phrases": phrases,
        "dialogue": dialogue,
        "passage": deepcopy(content["passage"]),
        "listening": {
            "prompt": "播放后，选择你听到的核心表达。",
            "text": focus_phrase["term"],
            "answer": focus_phrase["term"],
            "choices": [phrase["term"] for phrase in phrases],
        },
        "shadowing": {
            "text": dialogue[0]["text"],
            "translation": dialogue[0]["translation"],
        },
        "output": {
            "prompt": (
                f"在“{title}”场景中独立完成任务，不逐字翻译。"
                if lesson_type == "mission"
                else f"在“{title}”场景中，用目标语言完成一次属于你的表达。"
            ),
            "scaffold": [
                phrase["term"] for phrase in phrases[:scaffold_count]
            ],
        },
        "culture_note": content["culture_note"],
    }


def _checkpoint_lesson(
    *,
    meta: dict[str, Any],
    stage: dict[str, Any],
    stage_index: int,
) -> dict[str, Any]:
    first_scenario, first_title, _ = stage["scenarios"][0]
    second_scenario, second_title, _ = stage["scenarios"][1]
    first_content = meta["content"][first_scenario]
    second_content = meta["content"][second_scenario]
    phrases = deepcopy(
        first_content["phrases"][:2] + second_content["phrases"][:1]
    )
    dialogue = [
        {
            "speaker": "A",
            "text": phrases[0]["example"],
            "translation": phrases[0]["meaning"],
        },
        {
            "speaker": "B",
            "text": phrases[2]["example"],
            "translation": phrases[2]["meaning"],
        },
    ]
    unit_id = f"{meta['code']}-{stage['id']}-checkpoint"
    return {
        "id": unit_id,
        "unit_id": unit_id,
        "order": stage_index * 7 + 7,
        "stage_id": stage["id"],
        "level": stage["level"],
        "title": f"{stage['title']} · 阶段关卡",
        "scenario": f"{first_scenario}+{second_scenario}",
        "lesson_type": "checkpoint",
        "support_level": "minimal",
        "mastery_threshold": 85,
        "can_do": stage["can_do"],
        "estimated_minutes": 20,
        "phrases": phrases,
        "dialogue": dialogue,
        "passage": {
            "title": f"{first_title}与{second_title}",
            "text": (
                f"{first_content['passage']['text']}\n"
                f"{second_content['passage']['text']}"
            ),
            "translation": (
                f"{first_content['passage']['translation']}\n"
                f"{second_content['passage']['translation']}"
            ),
        },
        "listening": {
            "prompt": "阶段关卡：播放后选择准确表达。",
            "text": phrases[2]["term"],
            "answer": phrases[2]["term"],
            "choices": [phrase["term"] for phrase in phrases],
        },
        "shadowing": {
            "text": dialogue[1]["text"],
            "translation": dialogue[1]["translation"],
        },
        "output": {
            "prompt": (
                f"综合“{first_title}”和“{second_title}”，完成一段连贯的真实表达。"
            ),
            "scaffold": [phrases[0]["term"]],
        },
        "culture_note": (
            f"{first_content['culture_note']} {second_content['culture_note']}"
        ),
    }


def _build_pack(language_tag: str, meta: dict[str, Any]) -> dict[str, Any]:
    stages: list[dict[str, Any]] = []
    for stage_index, stage in enumerate(STAGES):
        lessons: list[dict[str, Any]] = []
        for unit_index, (scenario, title, can_do) in enumerate(stage["scenarios"]):
            for phase_index in range(len(PHASES)):
                lessons.append(
                    _scenario_lesson(
                        meta=meta, stage=stage, stage_index=stage_index,
                        unit_index=unit_index, scenario=scenario, title=title,
                        can_do=can_do, phase_index=phase_index,
                    )
                )
        lessons.append(
            _checkpoint_lesson(meta=meta, stage=stage, stage_index=stage_index)
        )
        stages.append({
            "id": stage["id"],
            "level": stage["level"],
            "title": stage["title"],
            "can_do": stage["can_do"],
            "lessons": lessons,
        })
    return {
        "id": meta["id"],
        "version": PACK_VERSION,
        "language_tag": language_tag,
        "name": meta["name"],
        "script": meta["script"],
        "pronunciation_scheme": meta["pronunciation_scheme"],
        "stages": stages,
    }


PACKS = {
    language_tag: _build_pack(language_tag, meta)
    for language_tag, meta in PACK_META.items()
}


def list_language_packs() -> list[dict[str, Any]]:
    return [deepcopy(PACKS[tag]) for tag in PACK_META]


def get_language_pack(language_tag: str) -> dict[str, Any] | None:
    pack = PACKS.get(language_tag)
    return deepcopy(pack) if pack else None


def get_language_lesson(
    language_tag: str, lesson_id: str
) -> dict[str, Any] | None:
    pack = PACKS.get(language_tag)
    if not pack:
        return None
    for stage in pack["stages"]:
        for lesson in stage["lessons"]:
            if lesson["id"] == lesson_id:
                return deepcopy(lesson)
    return None
