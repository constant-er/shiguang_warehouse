// 课表解析沿用星河欲转维护的正方教务 HTML 通用适配（zhengfang_01.js）。
// 基于 HTML 页面抓取的拾光课表正方适配脚本

/**
 * 解析表格
 */
function parserTbale() {
    const regexName = /[●★○]/g;
    const courseInfoList = [];

    document.querySelectorAll('#kbgrid_table_0 td').forEach((td) => {
        if (td.classList.contains('td_wrap') && td.textContent.trim() !== '') {
            const day = parseInt(td.getAttribute('id').split('-')[0]);

            td.querySelectorAll('.timetable_con.text-left').forEach((course) => {
                const name = [...course.querySelectorAll('.title font')].map(e => e.textContent).join('').replace(regexName, '').trim();

                const ps = course.querySelectorAll('p');
                const infoStr = ps[0]?.querySelectorAll('font[color]')[1]?.textContent.trim() || '';
                const position = ps[1] ? [...ps[1].querySelectorAll('font[color]')].map(e => e.textContent).join('').trim() : '';
                const teacherRaw = ps[2] ? [...ps[2].querySelectorAll('font[color]')].map(e => e.textContent).join('').trim() : '';
                const teacher = teacherRaw.replace(/[\(（][^\)）]*[\)）]/g, '').trim();

                if (infoStr && infoStr.match(/\((\d+-\d+节)\)/) && infoStr.split('节)')[1]) {
                    const [sections, weeks] = parserInfo(infoStr);

                    if (name && position && teacher && sections.length && weeks.length) {
                        const startSection = sections[0];
                        const endSection = sections[sections.length - 1];

                        const finalPosition = position.split(/\s+/).pop();

                        const data = { name, day, weeks, teacher, position: finalPosition, startSection, endSection };
                        courseInfoList.push(data);
                    }
                }
            });
        }
    });
    return courseInfoList;
}

/**
 * 解析列表
 */
function parserList() {
    const regexName = /[●★○]/g;
    const regexWeekNum = /周数：|周/g;
    const regexPosition = /上课地点：/g;
    const regexTeacher = /教师 ：/g;

    let courseInfoList = [];
    document.querySelectorAll('#kblist_table tbody').forEach((tbody, day) => {
        if (day > 0 && day < 8) {
            let sections;
            tbody.querySelectorAll('tr:not(:first-child)').forEach((tr) => {
                let name, font;

                if (tr.querySelectorAll('td').length > 1) {
                    const firstTd = tr.querySelector('td:first-child');
                    sections = parserSections(firstTd.textContent);
                    const secondTd = tr.querySelector('td:nth-child(2)');
                    name = [...secondTd.querySelectorAll('.title')].map(e => e.textContent).join('').replace(regexName, '').trim();
                    font = secondTd.querySelectorAll('p font');
                } else {
                    const td = tr.querySelector('td');
                    name = [...td.querySelectorAll('.title')].map(e => e.textContent).join('').replace(regexName, '').trim();
                    font = td.querySelectorAll('p font');
                }

                const weekStr = font[0] ? font[0].textContent.replace(regexWeekNum, '').trim() : '';
                const weeks = parserWeeks(weekStr);

                const positionRaw = font[1] ? font[1].textContent.replace(regexPosition, '').trim() : '';
                const finalPosition = positionRaw.split(/\s+/).pop();

                const teacherRaw = font[2] ? font[2].textContent.replace(regexTeacher, '').trim() : '';
                const teacher = teacherRaw.replace(/[\(（][^\)）]*[\)）]/g, '').trim();

                if (name && sections && weeks.length && teacher && finalPosition) {
                    const startSection = sections[0];
                    const endSection = sections[sections.length - 1];

                    const data = {
                        name,
                        day,
                        weeks,
                        teacher,
                        position: finalPosition,
                        startSection,
                        endSection
                    };
                    courseInfoList.push(data);
                }
            });
        }
    });
    return courseInfoList;
}

/**
 * 解析课程信息
 */
function parserInfo(str) {
    const sections = parserSections(str.match(/\((\d+-\d+节)\)/)[1].replace(/节/g, ''));
    const weekStrWithMarker = str.split('节)')[1];
    const weeks = parserWeeks(weekStrWithMarker.replace(/周/g, '').trim());
    return [sections, weeks];
}

/**
 * 解析节次
 */
function parserSections(str) {
    const [start, end] = str.split('-').map(Number);
    if (isNaN(start) || isNaN(end) || start > end) return [];
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

/**
 * 解析周次
 */
function parserWeeks(str) {
    const segments = str.split(',');
    let weeks = [];
    const segmentRegex = /(\d+)(?:-(\d+))?\s*(\([单双]\))?/g;

    for (const segment of segments) {
        const cleanSegment = segment.replace(/周/g, '').trim();
        segmentRegex.lastIndex = 0;

        let match;
        while ((match = segmentRegex.exec(cleanSegment)) !== null) {
            const start = parseInt(match[1]);
            const end = match[2] ? parseInt(match[2]) : start;
            const flagStr = match[3] || '';

            let flag = 0;
            if (flagStr.includes('单')) {
                flag = 1;
            } else if (flagStr.includes('双')) {
                flag = 2;
            }

            for (let i = start; i <= end; i++) {
                if (flag === 1 && i % 2 !== 1) continue;
                if (flag === 2 && i % 2 !== 0) continue;
                if (!weeks.includes(i)) {
                    weeks.push(i);
                }
            }
        }
    }

    return weeks.sort((a, b) => a - b);
}

async function scrapeAndParseCourses() {
    window.shiguangBridge.showToast("正在检查页面并抓取课程数据...");
    const ts = `1.登陆教务系统\n2.导航到学生课表查询页面\n3.等待课表信息加载，选择对应学年、学期，确认无误后点击【查询】\n4.确保页面上显示了课程表\n5.点击下方【一键导入】`
    try {
        const response = await fetch(window.location.href);
        const text = await response.text();
        if (!text.includes("课表查询")) {
            console.log("页面内容检查失败！");
            await window.shiguangBridgePromise.showAlert("导入失败", "当前页面似乎不是学生课表查询页面。请检查：\n" + ts, "确定");
            return null;
        }
        const typeElement = document.querySelector('#shcPDF');
        if (!typeElement) {
            console.log("未能找到视图类型元素 (#shcPDF)");
            await window.shiguangBridgePromise.showAlert("导入失败", "未能识别课表视图类型，请确认您已点击查询且课表已加载完毕。", "确定");
            return null;
        }
        const type = typeElement.dataset['type'];
        const tableElement = document.querySelector(type === 'list' ? '#kblist_table' : '#kbgrid_table_0');
        if (!tableElement) {
            console.log("未能找到课表主体 HTML");
            await window.shiguangBridgePromise.showAlert("导入失败", `未能找到课表主体 (${type} 视图)，请确认您已点击查询且课表已加载完毕。`, "确定");
            return null;
        }
        let result = [];
        if (type === 'list') {
            result = parserList();
        } else {
            result = parserTbale();
        }
        if (result.length === 0) {
            window.shiguangBridge.showToast("未找到任何课程数据，请检查所选学年学期是否正确或本学期无课。");
            return null;
        }
        console.log(`JS: 课程数据解析成功，共找到 ${result.length} 门课程。`);
        return { courses: result };
    } catch (error) {
        window.shiguangBridge.showToast(`抓取或解析失败: ${error.message}`);
        console.error('JS: Scrape/Parse Error:', error);
        await window.shiguangBridgePromise.showAlert("抓取或解析失败", `发生错误：${error.message}。请重试或联系开发者。`, "确定");
        return null;
    }
}

async function saveCourses(parsedCourses) {
    window.shiguangBridge.showToast(`正在保存 ${parsedCourses.length} 门课程...`);
    console.log(`JS: 尝试保存 ${parsedCourses.length} 门课程...`);
    try {
        await window.shiguangBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses, null, 2));
        console.log("JS: 课程保存成功！");
        return true;
    } catch (error) {
        window.shiguangBridge.showToast(`课程保存失败: ${error.message}`);
        console.error('JS: Save Courses Error:', error);
        return false;
    }
}

// 校历接口与字段参考旧版浙江理工适配（constant-er）。
async function fetchSemesterConfig() {
    const year = document.querySelector("#xnm")?.value;
    const term = document.querySelector("#xqm")?.value;
    if (!year || !term || !window.location.pathname.includes("/jwglxt/")) {
        throw new Error("未识别到所选学年和学期");
    }

    const url = new URL("/jwglxt/kbcx/xskbcxZccx_cxZcByXnxq.html", window.location.origin);
    url.search = new URLSearchParams({ gnmkdm: "N2154", xnm: year, xqm: term });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
        const response = await fetch(url.toString(), {
            credentials: "same-origin",
            headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
            signal: controller.signal
        });
        if (!response.ok) throw new Error("教务校历请求失败");
        const rows = await response.json();
        if (!Array.isArray(rows)) throw new Error("教务校历格式异常");

        const weeks = new Map();
        for (const row of rows) {
            const number = Number(row?.zs);
            const match = String(row?.rq ?? "").trim().match(/^(\d{4}-\d{2}-\d{2})\s*[/／]\s*(\d{4}-\d{2}-\d{2})$/);
            if (Number.isInteger(number) && number > 0 && match) weeks.set(number, match[1]);
        }
        const start = weeks.get(1);
        const date = new Date(start + "T00:00:00Z");
        if (!start || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) {
            throw new Error("教务校历缺少有效的第一教学周");
        }
        return { semesterStartDate: start, semesterTotalWeeks: Math.max(...weeks.keys()), firstDayOfWeek: 1 };
    } finally {
        clearTimeout(timeout);
    }
}

async function runImportFlow() {
    const alertConfirmed = await window.shiguangBridgePromise.showAlert(
        "浙江理工大学本科课表导入",
        "请登录 WebVPN，打开「教务管理系统」，进入学生课表查询页面，选择学期并查询。导入将同时更新目标课表的 12 节作息。",
        "开始导入"
    );
    if (!alertConfirmed) {
        window.shiguangBridge.showToast("用户取消了导入。");
        return;
    }

    const result = await scrapeAndParseCourses();
    if (result === null) {
        console.log("JS: 课程获取或解析失败，流程终止。");
        return;
    }
    const { courses } = result;

    const saveResult = await saveCourses(courses);
    if (!saveResult) {
        console.log("JS: 课程保存失败，流程终止。");
        return;
    }

    const timeSlots = [
        { number: 1, startTime: "08:10", endTime: "08:55" },
        { number: 2, startTime: "09:00", endTime: "09:45" },
        { number: 3, startTime: "10:00", endTime: "10:45" },
        { number: 4, startTime: "10:50", endTime: "11:35" },
        { number: 5, startTime: "11:40", endTime: "12:25" },
        { number: 6, startTime: "13:30", endTime: "14:15" },
        { number: 7, startTime: "14:20", endTime: "15:05" },
        { number: 8, startTime: "15:15", endTime: "16:00" },
        { number: 9, startTime: "16:05", endTime: "16:50" },
        { number: 10, startTime: "18:30", endTime: "19:15" },
        { number: 11, startTime: "19:20", endTime: "20:05" },
        { number: 12, startTime: "20:10", endTime: "20:55" },
    ];
    try {
        await window.shiguangBridgePromise.savePresetTimeSlots(JSON.stringify(timeSlots));
    } catch (error) {
        await window.shiguangBridgePromise.showAlert(
            "作息导入失败",
            `课程已导入，但未能更新学校作息：${error.message}`,
            "确定"
        );
        return;
    }

    try {
        const config = await fetchSemesterConfig();
        await window.shiguangBridgePromise.saveCourseConfig(JSON.stringify(config));
        window.shiguangBridge.showToast("浙江理工大学本科课表、作息和校历导入成功！");
    } catch (error) {
        console.warn("浙江理工大学校历导入失败", error);
        await window.shiguangBridgePromise.showAlert(
            "未能导入校历",
            "课程和作息已导入。请在课表设置中核对或手动填写开学日期和总周数。",
            "确定"
        );
    }
    console.log("JS: 整个导入流程执行完毕并成功。");
    window.shiguangBridge.notifyTaskCompletion();
}

runImportFlow();
