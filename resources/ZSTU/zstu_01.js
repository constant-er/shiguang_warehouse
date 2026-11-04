// 浙江理工大学（zstu.edu.cn）正方 V9 教务适配脚本
//
// 参考实现：resources/JSEI/jsei_01.js（正方 V9 通用模板，官方 Wiki 指定）
// 适配结构参考：resources/ZUST/zust_01.js（正方 V9 + WebVPN + 多校区作息）
// 本文件沿用 shiguang_warehouse 仓库 MIT 许可证。
//
// 已知教务入口：
//   WebVPN  : https://jwglxt-443.webvpn.zstu.edu.cn/jwglxt
//   校园直连 : https://jwglxt.zstu.edu.cn/jwglxt   （若存在）
//
// 使用方式：
//   1. 浏览器打开 WebVPN，用统一身份认证登录
//   2. 在 WebVPN 资源列表里点击「教务系统」进入教学管理信息服务平台
//   3. 回到 App 的导入流程，点击本适配器的「执行导入」
//
// 浙理工有两个校区（下沙校区 / 临平校区），两者作息时间相同（已核实）。
// 因此脚本会先比对各校区作息：若一致则所有课程共用同一套节次时间；
// 若某学期学校调整导致不一致，脚本会自动降级为「按课程所属校区单独修正时间」，
// 并保留原节次编号，课表网格不会错位。
// 注意：作息相同不代表教室相同，两校区教工楼不同，课程地点仍保留校区名前缀。

// ============================================================
// 基础配置
// ============================================================

const ZSTU_CONFIG = {
    // WebVPN 域名与教务直连域名，按当前页面自动选择
    hosts: {
        // WebVPN 门户（登录页、认证页、资源列表）—— import_url 指向这里
        webvpn: [
            'sslvpn.zstu.edu.cn',                    // ★ SSLVPN 门户（import_url 指向这里）
            'webvpn.zstu.edu.cn',                    // WebVPN 门户（备用）
            'sso-443.webvpn.zstu.edu.cn',           // 统一身份认证
            'sso.zstu.edu.cn',                       // 直连统一身份认证
            'jwglxt-443.webvpn.zstu.edu.cn',        // 教务系统（正方）
            'jwglxt.webvpn.zstu.edu.cn'             // 教务系统备用域名
        ],
        // 校园网直连（域名不公开，猜的，不影响使用）
        campus: ['jwglxt.zstu.edu.cn', 'jwc.zstu.edu.cn', 'jw.zstu.edu.cn']
    },
    // 正方 V9 功能模块编号
    // ✅ 已通过浙理工实际抓包确认：个人课表查询页面为
    //    https://jwglxt-443.webvpn.zstu.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151
    gnmkdm: {
        course: 'N2151',   // 个人课表查询 / 学年学期
        schedule: 'N2154'  // 校历 / 校区作息
    },
    campusLabel: '校区'
};

function zstuToast(message) {
    window.shiguangBridge.showToast(message);
}

function zstuConfirmed(value) {
    return value === true || value === 'true';
}

function zstuText(value) {
    return String(value == null ? '' : value).trim();
}

/**
 * 判断当前是否已处于教务系统（正方）页面。
 *
 * 命中条件：域名在白名单内，且路径含 /jwglxt/
 * - WebVPN 门户首页 (webvpn.zstu.edu.cn/) → false，静默等待
 * - 统一身份认证页 (sso-443.webvpn...)   → false，静默等待
 * - 教务系统页 (jwglxt-443.webvpn...)     → true，开始导入
 */
function isOnCourseSystemPage() {
    const host = window.location.hostname;
    const path = window.location.pathname || '';
    const all = ZSTU_CONFIG.hosts.webvpn.concat(ZSTU_CONFIG.hosts.campus);

    let matched = false;
    for (const candidate of all) {
        if (host === candidate || host.endsWith('.' + candidate)) {
            matched = true;
            break;
        }
    }
    if (!matched) return false;

    // 必须已经在正方的 /jwglxt/ 路径下
    return /\/jwglxt\//.test(path) || /\/jwglxt$/.test(path);
}

/**
 * 判断当前页面是否已在教务系统（正方页面）内。
 *
 * ★ 浙理工的关键特性（2026-11-04 实测）：
 *   直接访问 https://jwglxt-443.webvpn.zstu.edu.cn/... 是不行的！
 *   必须是：先登录 https://webvpn.zstu.edu.cn/ → 在资源列表点「教务系统」
 *   → 才会跳到 jwglxt-443.webvpn.zstu.edu.cn 并带上有效会话。
 *   直接进教务系统地址会显示「用户名或密码错误」（因为那是统一身份认证在拦）。
 *
 * 因此脚本要在 WebVPN 首页时给出明确引导，而不是笼统报错。
 */
function getBaseUrl() {
    const host = window.location.hostname;
    const all = ZSTU_CONFIG.hosts.webvpn.concat(ZSTU_CONFIG.hosts.campus);

    let matched = null;
    for (const candidate of all) {
        if (host === candidate || host.endsWith('.' + candidate)) {
            matched = candidate;
            break;
        }
    }

    if (!matched) {
        throw new Error(
            '当前不是教务系统页面。\n\n' +
            '请按顺序操作：\n' +
            '1. 在上方地址栏打开 https://webvpn.zstu.edu.cn/\n' +
            '2. 用统一身份认证登录（学号密码 / 微信 / 钉钉均可）\n' +
            '3. 在资源列表点「教务系统」进入教学管理信息服务平台\n' +
            '4. 左侧「信息查询」→「个人课表查询」，选好学年学期并点「查询」\n' +
            '5. 回到此页点「执行导入」\n\n' +
            '当前页面域名：' + host
        );
    }

    // 已经在 WebVPN 主页（还没进教务系统）→ 给出更具体的引导
    const isWebvpnHost = ZSTU_CONFIG.hosts.webvpn.some(function (h) {
        return host === h || host.endsWith('.' + h);
    });

    if (isWebvpnHost && !/jwglxt/.test(host)) {
        throw new Error(
            '您当前在 WebVPN 门户页，还没有进入教务系统。\n\n' +
            '请在上面的资源列表中点击「教务系统」图标进入' +
            '「教学管理信息服务平台」，然后在左侧「信息查询」→' +
            '「个人课表查询」选好学年学期点「查询」，再回到此页执行导入。\n\n' +
            '提示：直接在地址栏输入教务系统地址（' +
            'https://jwglxt-443.webvpn.zstu.edu.cn/...）是无法登录的，' +
            '必须从 WebVPN 门户 https://webvpn.zstu.edu.cn/ 点进去。'
        );
    }

    return window.location.origin + '/jwglxt/';
}

/**
 * 统一的请求封装：处理登录态失效、返回格式异常等情况。
 *
 * 参数分两处：
 *   - params      → 放在 query string
 *   - options.bodyParams → 放在 POST body（配合 options.method = 'POST'）
 * 这样可以精确复刻浙理工教务的实际请求形态（gnmkdm 在 query，其余在 body）。
 */
async function zstuRequest(path, params, options) {
    const opts = options || {};
    const url = new URL(getBaseUrl() + path);

    const init = {
        method: opts.method || 'GET',
        credentials: 'same-origin',
        headers: {
            'Accept': opts.json === false ? 'text/html,application/xhtml+xml' : 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest'
        }
    };

    // query 参数始终放在 URL 上
    for (const key in params) {
        if (params[key] !== undefined && params[key] !== null) {
            url.searchParams.set(key, params[key]);
        }
    }

    if (opts.method === 'POST') {
        init.headers['Content-Type'] = 'application/x-www-form-urlencoded;charset=UTF-8';
        const source = opts.bodyParams || {};
        const body = [];
        for (const key in source) {
            if (source[key] !== undefined && source[key] !== null) {
                body.push(encodeURIComponent(key) + '=' + encodeURIComponent(source[key]));
            }
        }
        init.body = body.join('&');
    }

    const response = await fetch(url.toString(), init);
    if (!response.ok) {
        throw new Error('教务请求失败（HTTP ' + response.status + '），请稍后重试。');
    }

    const text = await response.text();

    // 登录态失效判定：被重定向到认证服务器，或页面是统一身份认证页
    const finalUrl = response.url || '';
    if (/authserver\/|login_slogin|\/users\/auth\/cas|\/users\/sign_in/i.test(finalUrl)) {
        throw new Error('登录已过期，请重新登录 WebVPN 并进入教务系统后重试。');
    }
    if (/<title[^>]*>\s*(统一身份认证|WebVPN|正方)/i.test(text)) {
        throw new Error('当前页面不是教务系统页面，请通过 WebVPN 进入「教务系统」后重试。');
    }

    // 页面本身在，但内容是登录页（正方的登录页标题不含"正方"两字时用特征判断）
    if (/login_slogin|统一身份认证|密码错误|用户名或密码/i.test(text.slice(0, 3000))) {
        throw new Error(
            '教务系统提示未登录或凭据错误。\n\n' +
            '浙理工无法直接访问教务系统地址，必须：\n' +
            '1. 打开 https://webvpn.zstu.edu.cn/ 并登录\n' +
            '2. 在资源列表点「教务系统」进入教学管理信息服务平台\n' +
            '3. 左侧「信息查询」→「个人课表查询」，选好学年学期并点「查询」\n' +
            '4. 回到本页执行导入'
        );
    }

    if (opts.json === false) return text;

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error('教务未返回有效数据，请确认已经进入教务系统并重新登录。');
    }
}

// ============================================================
// 交互辅助
// ============================================================

async function zstuSelect(title, entries, defaultIndex) {
    const labels = entries.map(function (e) { return e.label; });
    const value = await window.shiguangBridgePromise.showSingleSelection(
        title, JSON.stringify(labels), defaultIndex === undefined ? 0 : defaultIndex
    );
    if (value === null || value === undefined || value === 'null' || value === -1 || value === '-1') {
        return null;
    }
    if (!/^\d+$/.test(String(value)) || !entries[Number(value)]) {
        throw new Error('选择无效，请重新导入。');
    }
    return entries[Number(value)];
}

async function promptUserToStart() {
    const confirmed = await window.shiguangBridgePromise.showAlert(
        '准备导入课表',
        '请确认您已完成以下步骤：\n\n' +
        '① 在 WebVPN 门户（webvpn.zstu.edu.cn）完成统一身份认证登录\n' +
        '② 在资源列表点击「教务系统」，进入教学管理信息服务平台\n' +
        '③ 左侧「信息查询」→「个人课表查询」，选定学年学期并点「查询」\n' +
        '④ 确认页面上已显示出课表\n\n' +
        '（若还没做，请先在上面的网页里完成，再回来点「开始导入」）\n\n' +
        '本适配会自动读取本学期课表、校历与校区作息时间。',
        '开始导入'
    );
    if (!zstuConfirmed(confirmed)) {
        window.shiguangBridge.showToast('用户取消了导入。');
        return false;
    }
    return true;
}

// ============================================================
// 解析：周次
// ============================================================

/**
 * 解析正方的 zcd 周次字段。
 * 典型取值："1-16周"、"1-8周(单)"、"1,3,5-9周"、"第1-16周"。
 */
function parseWeeks(weekStr) {
    if (!weekStr) return [];

    const cleaned = zstuText(weekStr)
        .replace(/周数[:：]/g, '')
        .replace(/第/g, '')
        .replace(/周/g, '')
        .replace(/共\s*\d+\s*.*$/g, '');

    const segments = cleaned.split(/[,，、;；]/);
    const weeks = [];
    const segRegex = /(\d+)(?:\s*[-~]\s*(\d+))?\s*(?:[（(]?\s*([单双])\s*周?\s*[)）]?)?/g;

    for (const seg of segments) {
        const s = seg.trim();
        if (!s) continue;

        segRegex.lastIndex = 0;
        let m;
        while ((m = segRegex.exec(s)) !== null) {
            if (m[0] === '') { segRegex.lastIndex++; continue; }

            const start = parseInt(m[1], 10);
            const end = m[2] ? parseInt(m[2], 10) : start;
            const flagStr = m[3] || '';

            if (!isFinite(start) || start < 1) continue;

            for (let w = start; w <= end && w <= 60; w++) {
                if (flagStr.indexOf('单') >= 0 && w % 2 === 0) continue;
                if (flagStr.indexOf('双') >= 0 && w % 2 !== 0) continue;
                weeks.push(w);
            }
        }
    }

    const unique = Array.from(new Set(weeks)).sort(function (a, b) { return a - b; });
    if (unique.length === 0) throw new Error('课程周次为空或无法识别：' + weekStr);
    return unique;
}

// ============================================================
// 解析：节次
// ============================================================

/**
 * 解析节次字段。
 * 浙理工实际返回：
 *   jc  = "1-8节"   ← 带"节"字后缀
 *   jcs = "1-8"     ← 纯数字区间，优先用这个
 *   jcor= "1-8"
 * 浙科大返回 jcs = "1-2"。
 * 这里优先取 jcs，失败再退回 jc，并容忍"节"后缀。
 */
function parseSections(sectionStr) {
    const text = zstuText(sectionStr).replace(/节\s*$/, '');
    if (!text) return null;

    const parts = text.split(/[,，]/);
    let start = null;
    let end = null;

    for (const part of parts) {
        const m = part.trim().match(/^(\d+)\s*(?:[-~]\s*(\d+))?$/);
        if (!m) continue;
        const s = parseInt(m[1], 10);
        const e = m[2] ? parseInt(m[2], 10) : s;
        if (start === null || s < start) start = s;
        if (end === null || e > end) end = e;
    }

    if (start === null || end === null) return null;
    if (start < 1 || end < start || end > 30) return null;
    return { start: start, end: end };
}

/**
 * 规范化教师字段。
 * 浙理工存在多教师合上（如 "沈晶晶,闻洁璐,汤曹辉,黄海峰"），
 * 保留全部并用中文顿号分隔，避免信息丢失。
 */
function parseTeachers(raw) {
    const text = zstuText(raw);
    if (!text) return '';

    const names = text.split(/[,，;；]/).map(function (n) {
        return n.trim();
    }).filter(function (n) {
        return n.length > 0;
    });

    return names.join('、');
}

// ============================================================
// 获取：学年学期
// ============================================================

async function fetchAcademicOptions() {
    const html = await zstuRequest(
        'kbcx/xskbcx_cxXskbcxIndex.html',
        { gnmkdm: ZSTU_CONFIG.gnmkdm.course, layout: 'default' },
        { json: false }
    );

    const doc = new DOMParser().parseFromString(html, 'text/html');
    function read(selector) {
        const out = [];
        doc.querySelectorAll(selector + ' option').forEach(function (option) {
            if (!option.disabled && option.value.trim()) {
                out.push({
                    value: option.value.trim(),
                    label: option.textContent.trim(),
                    selected: option.selected
                });
            }
        });
        return out;
    }

    const years = read('#xnm');
    const terms = read('#xqm');
    if (years.length === 0 || terms.length === 0) {
        throw new Error('未取得教务返回的学年学期列表，请确认已正确进入教务系统。');
    }
    return { years: years, terms: terms };
}

/**
 * 从学年选项中同时取出「起始年」和「完整学年名」两种形式。
 *
 * 浙理工实测（2026-11-04）：
 *   下拉框显示  学年 = 2026-2027，学期 = 1
 *   但响应里是  xsxx.XNM = "2026"（起始年）
 *                xsxx.XNMC = "2026-2027"（完整学年名）
 *                xsxx.XQM = "3"（学期代码）
 *                xsxx.XQMMC = "1"（学期名）
 *
 * 不同学校 POST body 里 xnm/xqm 用哪一种并不统一，
 * 因此这里把两种候选都保留下来，实际请求时以接口返回结果为准。
 */
function extractYearForms(yearOption) {
    const forms = [];
    const push = function (v) {
        const s = zstuText(v);
        // 去掉"学年""年度"等显示用后缀，只保留可能是请求值的纯编码形式
        const cleaned = s.replace(/\s*(学年|年度|学年年度)\s*$/, '').trim();
        if (cleaned && forms.indexOf(cleaned) < 0) forms.push(cleaned);
    };

    push(yearOption.value);                 // option 的 value（最常见）
    push(yearOption.label);                 // option 的显示文本

    // "2026-2027" → "2026"（起始年）
    const m = zstuText(yearOption.label).match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (m) push(m[1]);

    // "2026-2027" → "2026"（来自 value）
    const mv = zstuText(yearOption.value).match(/^(\d{4})\s*-\s*(\d{4})$/);
    if (mv) push(mv[1]);

    return forms;
}

/**
 * 从学期选项中取出可能的学期代码 / 学期名。
 * 浙理工：显示 "1"，内部代码可能是 "3"。
 */
function extractTermForms(termOption) {
    const forms = [];
    const push = function (v) {
        const s = zstuText(v);
        if (s && forms.indexOf(s) < 0) forms.push(s);
    };

    push(termOption.value);
    push(termOption.label);
    return forms;
}

async function selectAcademicYearAndSemester() {
    const options = await fetchAcademicOptions();

    let yearIndex = 0, termIndex = 0;
    options.years.forEach(function (y, i) { if (y.selected) yearIndex = i; });
    options.terms.forEach(function (t, i) { if (t.selected) termIndex = i; });

    function make(year, term) {
        return {
            year: year.value,
            term: term.value,
            yearForms: extractYearForms(year),
            termForms: extractTermForms(term),
            label: year.label + ' 第 ' + term.label + ' 学期'
        };
    }

    const current = make(options.years[yearIndex], options.terms[termIndex]);

    const action = await zstuSelect('选择导入学期', [
        { label: current.label, value: 'current' },
        { label: '更换学年、学期', value: 'change' }
    ], 0);

    if (!action) return null;
    if (action.value === 'current') return current;

    const year = await zstuSelect('选择学年', options.years, yearIndex);
    if (!year) return null;
    const term = await zstuSelect('选择学期', options.terms, termIndex);
    if (!term) return null;
    return make(year, term);
}

// ============================================================
// 获取：课表
// ============================================================

/**
 * 获取个人课表。
 * ✅ 已通过浙理工实际抓包确认：该接口为 POST（不是 GET）。
 *    抓包证据：
 *      URL     : https://jwglxt-443.webvpn.zstu.edu.cn/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151
 *      Method  : POST
 *      Status  : 200 OK
 *      前端源码 (cxKbContent 函数):
 *        $.ajax({ type: 'POST', url: _path+'/kbcx/xskbcx_cxXsgrkb.html', ... })
 *    gnmkdm 固定放在 query 上，其余参数走 POST body。
 *
 * ⚠️ xnm / xqm 的取值格式各校不同：
 *    浙理工页面显示「学年 2026-2027、学期 1」，但响应里 xsxx.XNM="2026"、xsxx.XQM="3"。
 *    因此这里按候选组合依次尝试，以「能返回非空 kbList」为准。
 */
async function fetchCourses(semester) {
    const yearForms = (semester.yearForms && semester.yearForms.length)
        ? semester.yearForms : [semester.year];
    const termForms = (semester.termForms && semester.termForms.length)
        ? semester.termForms : [semester.term];

    let lastError = null;

    for (const year of yearForms) {
        for (const term of termForms) {
            let data;
            try {
                data = await zstuRequest('kbcx/xskbcx_cxXsgrkb.html', {
                    gnmkdm: ZSTU_CONFIG.gnmkdm.course
                }, {
                    method: 'POST',
                    bodyParams: {
                        xnm: year,
                        xqm: term,
                        kzlx: 'ck',
                        xsdm: '',
                        kclbdm: '',
                        kclxdm: ''
                    }
                });
            } catch (error) {
                lastError = error;
                continue;
            }

            if (data && Array.isArray(data.kbList) && data.kbList.length > 0) {
                console.log('[ZSTU] 课表请求命中：xnm=' + year + ' xqm=' + term);
                return data;
            }
            lastError = new Error('教务未返回课表数据');
        }
    }

    if (lastError) throw lastError;
    throw new Error('教务未返回课表数据，请确认已登录并进入教务系统。');
}

/**
 * 解析课表数据。
 * ✅ 已用浙理工真实响应验证字段（2026-11-04 实测）：
 *   kcmc 课程名 | xm 教师（多人逗号分隔）| cdmc 教室 | xqj 星期(1-7)
 *   jcs 节次("1-8") | zcd 周次("1-16周") | xf 学分 | xqh_id 校区ID | xqmc 校区名
 *   kcxszc "讲课:28,实验:4" | kclb 课程类别 | kch 课程号 | jxbmc 教学班
 *
 * 注意：同一门课可能出现多条记录（不同星期/周次段/校区），
 * 每条是独立的上课时段，应分别导入，不能合并。
 */
function parseCourses(data) {
    const courses = [];
    const campuses = new Map();
    const courseCodes = new Map();

    for (const row of data.kbList) {
        const name = zstuText(row.kcmc);
        const day = Number(row.xqj);
        const section = parseSections(row.jcs);

        if (!name || !isFinite(day) || day < 1 || day > 7 || !section) {
            continue;
        }

        const campusId = zstuText(row.xqh_id);
        const campusName = zstuText(row.xqmc);
        const room = zstuText(row.cdmc);

        const course = {
            name: name,
            teacher: parseTeachers(row.xm),
            position: campusName ? (campusName + (room ? ' ' + room : '')) : room,
            day: day,
            startSection: section.start,
            endSection: section.end,
            weeks: parseWeeks(row.zcd)
        };

        if (zstuText(row.xf) !== '') {
            const credit = Number(row.xf);
            if (isFinite(credit) && credit >= 0) course.credit = credit;
        }

        // 记录课程号，方便后续与资料平台按课程号关联
        const code = zstuText(row.kch);
        if (code && !courseCodes.has(name)) courseCodes.set(name, code);
        if (code) course.courseCode = code;

        // 记录所属校区，供作息不一致时按校区精确匹配
        course.campusId = campusId;

        courses.push(course);
        if (campusId && campusName) campuses.set(campusId, campusName);
    }

    if (courses.length === 0) {
        throw new Error('该学期没有固定时间的课程，请更换学期或等待排课完成。');
    }
    return {
        courses: courses,
        campuses: campuses,
        courseCodes: courseCodes,
        unscheduled: Array.isArray(data.sjkList) ? data.sjkList : []
    };
}

// ============================================================
// 获取：校历（开学日期 + 总周数）
// ============================================================

async function fetchSemesterStartDate(academicYear, semesterCode) {
    const rows = await zstuRequest('kbcx/xskbcxZccx_cxZcByXnxq.html', {
        gnmkdm: ZSTU_CONFIG.gnmkdm.schedule,
        xnm: academicYear,
        xqm: semesterCode
    });

    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('未取得所选学期的校历数据。');
    }

    const weeks = [];
    for (const row of rows) {
        const num = zstuText(row.zs);
        if (!/^\d+$/.test(num)) continue;

        const dateText = zstuText(row.rq);
        const m = dateText.match(/^(\d{4}-\d{2}-\d{2})\s*[\/／]\s*(\d{4}-\d{2}-\d{2})$/);
        if (!m) continue;

        weeks.push({ number: parseInt(num, 10), start: m[1], end: m[2] });
    }

    if (weeks.length === 0) {
        throw new Error('校历数据格式异常，无法解析开学日期。');
    }

    weeks.sort(function (a, b) { return a.number - b.number; });

    // 取第一教学周的周一作为学期开始日期
    const first = weeks[0];
    const firstDate = new Date(first.start + 'T00:00:00Z');
    if (isNaN(firstDate.getTime())) {
        throw new Error('校历开始日期格式异常。');
    }

    return {
        semesterStartDate: first.start,
        semesterTotalWeeks: weeks.length,
        firstDayOfWeek: 1
    };
}

// ============================================================
// 获取：校区作息
// ============================================================

/**
 * 读取指定校区的节次时间表。
 * 浙理工下沙 / 临平两校区作息相同（已核实），但脚本仍逐校区读取后再比对，
 * 以便在作息发生调整时自动降级处理，而不是直接报错。
 */
async function fetchTimeSlots(academicYear, semesterCode, campusId) {
    const json = await zstuRequest('jzgl/skxxMobile_cxRsdjc.html', {
        gnmkdm: ZSTU_CONFIG.gnmkdm.schedule
    }, {
        method: 'POST',
        bodyParams: {
            xnm: academicYear,
            xqm: semesterCode,
            xqh_id: campusId
        }
    });

    if (!Array.isArray(json) || json.length === 0) {
        throw new Error('未取得该校区的作息时间。');
    }

    const seen = {};
    const slots = [];

    for (const item of json) {
        if (!item || !item.jcmc || !item.qssj || !item.jssj) continue;
        if (campusId && zstuText(item.xqh_id) && zstuText(item.xqh_id) !== String(campusId)) continue;

        const num = Number(item.jcmc);
        if (!isFinite(num) || num < 1 || seen[num]) continue;

        const startTime = zstuText(item.qssj).substring(0, 5);
        const endTime = zstuText(item.jssj).substring(0, 5);
        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) continue;
        if (startTime >= endTime) continue;

        seen[num] = true;
        slots.push({ number: num, startTime: startTime, endTime: endTime });
    }

    slots.sort(function (a, b) { return a.number - b.number; });

    // 校验：编号从 1 连续递增且时间不重叠
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].number !== i + 1) {
            throw new Error('作息节次编号不连续，请核对教务数据。');
        }
        if (i > 0 && slots[i].startTime < slots[i - 1].endTime) {
            throw new Error('作息时间存在重叠，请核对教务数据。');
        }
    }

    if (slots.length === 0) {
        throw new Error('该校区作息数据为空。');
    }
    return slots;
}

// ============================================================
// 主流程
// ============================================================

async function saveCourses(courses) {
    const ok = await window.shiguangBridgePromise.saveImportedCourses(JSON.stringify(courses));
    if (!zstuConfirmed(ok)) {
        throw new Error('课程数据保存未成功，请重新导入。');
    }
}

async function importPresetTimeSlots(slots) {
    const ok = await window.shiguangBridgePromise.savePresetTimeSlots(JSON.stringify(slots));
    if (!zstuConfirmed(ok)) {
        throw new Error('作息数据保存未成功，请重新导入。');
    }
}

async function runImportFlow() {
    let savedStage = '';

    try {
        // 0. 前置检查：确认当前已在教务系统页面
        //
        // ★ 重要：脚本在每次页面加载完成时都会被注入（拾光 WebView 的机制）。
        //   用户刚打开 WebVPN 门户时，脚本也会跑一次，但那时还没进教务系统。
        //   此时必须静默退出，不能弹错误框打断用户 ——
        //   等用户点进「教务系统」后，脚本会随新页面自动重新注入并正常执行。
        if (!isOnCourseSystemPage()) {
            console.log('[ZSTU] 当前不在教务系统页面，等待用户进入教务系统后再自动执行…');
            return;
        }

        getBaseUrl();
        if (!await promptUserToStart()) return;

        // 1. 选择学年学期
        zstuToast('正在读取学年学期列表…');
        const semester = await selectAcademicYearAndSemester();
        if (!semester) { zstuToast('导入已取消'); return; }

        // 2. 读取课表（自动尝试学年/学期的不同取值格式）
        zstuToast('正在读取本学期课表…');
        const raw = await fetchCourses(semester);
        const parsed = parseCourses(raw);

        // 3. 读取校历（使用与课表相同的学期取值，保证口径一致）
        zstuToast('正在读取校历与开学日期…');
        const config = await fetchSemesterStartDate(semester.year, semester.term);

        // 4. 读取各校区作息
        zstuToast('正在读取校区作息时间…');
        const schedules = new Map();
        const campusOptions = [];

        for (const entry of parsed.campuses) {
            try {
                const slots = await fetchTimeSlots(semester.year, semester.term, entry[0]);
                schedules.set(entry[0], slots);
                campusOptions.push({ value: entry[0], label: entry[1] });
            } catch (error) {
                // 单个校区作息取不到不阻断，继续用其他校区
                console.warn('[ZSTU] 校区作息获取失败:', entry[1], error);
            }
        }

        if (schedules.size === 0) {
            throw new Error('未能取得任何校区的作息时间，请确认已进入教务系统后重试。');
        }

        // 4.1 比对各校区作息是否一致
        // 浙理工下沙 / 临平作息相同（已核实），正常情况下会走「统一作息」分支：
        // 不需要用户选校区，所有课程共用同一套节次时间。
        // 若学校后续调整导致不一致，则自动降级到「按校区分别修正」的分支。
        const campusesIdentical = areSchedulesIdentical(schedules);

        // 5. 确定基础作息
        // 统一作息时直接取第一份，不再弹校区选择框（少一步交互）
        let baseSlots;
        let baseCampusLabel;

        if (campusesIdentical) {
            baseSlots = schedules.values().next().value;
            baseCampusLabel = campusOptions.length > 1
                ? campusOptions.map(function (c) { return c.label; }).join(' / ') + '（作息一致）'
                : campusOptions[0].label;
        } else {
            // 降级路径：作息不一致，让用户选一个作为课表基准
            let baseCampus = campusOptions[0];
            if (campusOptions.length > 1) {
                baseCampus = await zstuSelect('选择课表基础作息' + ZSTU_CONFIG.campusLabel, campusOptions, 0);
                if (!baseCampus) { zstuToast('导入已取消'); return; }
            }
            baseSlots = schedules.get(baseCampus.value);
            baseCampusLabel = baseCampus.label;
        }

        // 6. 组装课程
        const courses = [];
        let customCount = 0;

        for (const course of parsed.courses) {
            // 统一作息：直接用基准作息，不做逐条比较
            if (!campusesIdentical) {
                const ownSlots = findCourseSlots(schedules, course);
                let differs = false;

                for (let n = course.startSection; n <= course.endSection; n++) {
                    const own = ownSlots ? ownSlots[n - 1] : null;
                    const base = baseSlots[n - 1];
                    if (!base) throw new Error('课程节次超出基础作息范围：' + course.name);
                    if (own && (own.startTime !== base.startTime || own.endTime !== base.endTime)) {
                        differs = true;
                    }
                }

                if (differs && ownSlots) {
                    course.isCustomTime = true;
                    course.customStartTime = ownSlots[course.startSection - 1].startTime;
                    course.customEndTime = ownSlots[course.endSection - 1].endTime;
                    customCount++;
                }
            } else {
                // 统一作息下只需校验节次范围
                if (!baseSlots[course.endSection - 1]) {
                    throw new Error('课程节次超出作息范围：' + course.name);
                }
            }

            for (const week of course.weeks) {
                if (week > config.semesterTotalWeeks) {
                    throw new Error('课程「' + course.name + '」周次超出所选学期校历范围，请核对。');
                }
            }

            courses.push(course);
        }

        // 7. 展示确认信息
        let note = semester.label + '\n' +
            courses.length + ' 条课程时段\n' +
            '作息：' + baseCampusLabel + '，共 ' + baseSlots.length + ' 节\n' +
            '第一周周一：' + config.semesterStartDate + '\n' +
            '校历周数：' + config.semesterTotalWeeks + ' 周';

        note += '\n\n作息时间：';
        for (const slot of baseSlots) {
            note += '\n第 ' + slot.number + ' 节 ' + slot.startTime + '-' + slot.endTime;
        }

        if (customCount > 0) {
            note += '\n\n另有 ' + customCount + ' 条课程按其所属校区的真实时间导入，并保留原节次编号。';
        }

        if (parsed.unscheduled.length > 0) {
            note += '\n\n以下课程尚无固定上课时间，本次不导入：';
            for (const row of parsed.unscheduled) {
                // 浙理工实测字段：kcmc 课程名 / qsjsz 起止周描述 / jsxm 教师
                const teacher = parseTeachers(row.jsxm);
                note += '\n' + zstuText(row.kcmc) +
                    (teacher ? '（' + teacher + ' ' : '（') +
                    zstuText(row.qsjsz) + '）';
            }
        }

        const confirmed = await window.shiguangBridgePromise.showAlert('核对导入信息', note, '确认导入');
        if (!zstuConfirmed(confirmed)) { zstuToast('导入已取消'); return; }

        // 8. 依次保存
        const configOk = await window.shiguangBridgePromise.saveCourseConfig(JSON.stringify(config));
        if (!zstuConfirmed(configOk)) throw new Error('学期配置保存未成功。');
        savedStage = '学期配置';

        await importPresetTimeSlots(baseSlots);
        savedStage = '学期配置和作息';

        // 移除仅供脚本内部使用的 campusId，不把无关字段传给 App
        // （App 侧 ignoreUnknownKeys = true，多传也不会崩，但保持干净）
        for (const course of courses) {
            delete course.campusId;
        }

        await saveCourses(courses);

        zstuToast('已导入 ' + courses.length + ' 条课程时段及 ' + baseSlots.length + ' 节作息');
        window.shiguangBridge.notifyTaskCompletion();

    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        await window.shiguangBridgePromise.showAlert(
            '导入未完成',
            (savedStage ? savedStage + '已保存，后续步骤未完成，请重新导入。\n' : '') + message,
            '知道了'
        );
    }
}

/**
 * 比对各校区的作息时间表是否完全一致。
 * 浙理工下沙 / 临平作息相同（已核实），一致时所有课程可共用一套节次时间，
 * 无需为每门课单独修正时间。
 */
function areSchedulesIdentical(schedules) {
    const list = [];
    schedules.forEach(function (slots) { list.push(slots); });

    if (list.length <= 1) return true;

    const first = list[0];
    for (let i = 1; i < list.length; i++) {
        const other = list[i];
        if (!other || other.length !== first.length) return false;

        for (let n = 0; n < first.length; n++) {
            if (first[n].number !== other[n].number ||
                first[n].startTime !== other[n].startTime ||
                first[n].endTime !== other[n].endTime) {
                return false;
            }
        }
    }
    return true;
}

/**
 * 找到该课程所属校区的作息表。
 * 优先按课程自身的 campusId 精确匹配；取不到时回退到「节次数量足够」的第一套。
 * 注意：不能只按节次数量匹配，否则会拿到别的校区的作息，导致跨校区时间修正失效。
 */
function findCourseSlots(schedules, course) {
    if (course.campusId && schedules.has(course.campusId)) {
        return schedules.get(course.campusId);
    }

    const candidates = [];
    schedules.forEach(function (slots) { candidates.push(slots); });

    for (const slots of candidates) {
        if (slots.length >= course.endSection) return slots;
    }
    return candidates.length > 0 ? candidates[0] : null;
}

runImportFlow();
