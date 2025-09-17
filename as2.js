const http = require('http');
const url = require('url');
const fs = require('fs');

function loadData() {
	const rawText = fs.readFileSync('as1.json', 'utf8');
	const raw = JSON.parse(rawText);
	const students = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.students) ? raw.students : []);
	const cfg = Array.isArray(raw) ? {} : (raw && raw.config ? raw.config : {});
	return { raw, students, cfg };
}

function saveData(raw, students) {
	if (Array.isArray(raw)) {
		// legacy format: just array of students
		fs.writeFileSync('as1.json', JSON.stringify(students, null, 2));
		return;
	}
	const out = { ...raw, students };
	fs.writeFileSync('as1.json', JSON.stringify(out, null, 2));
}

function getRiskLabel(score, riskLabels) {
	const key = String(score);
	if (riskLabels && Object.prototype.hasOwnProperty.call(riskLabels, key)) return riskLabels[key];
	return 'Low';
}

function calculateRiskForStudent(student, cfg) {
	let score = 0;
	let attendCount = 0;
	let assignmentCount = 0;
	let failedContactCount = 0;

	const attendanceRateThreshold = typeof cfg.attendanceRateThreshold === 'number' ? cfg.attendanceRateThreshold : 0.75;
	const assignmentRateThreshold = typeof cfg.assignmentRateThreshold === 'number' ? cfg.assignmentRateThreshold : 0.5;
	const failedContactsThreshold = typeof cfg.failedContactsThreshold === 'number' ? cfg.failedContactsThreshold : 2;

	(student.attendance || []).forEach(attendance => {
		if (attendance.status === 'ATTEND') {
			attendCount++;
		}
	});
	(student.assignments || []).forEach(assignment => {
		if (assignment.submitted) {
			assignmentCount++;
		}
	});
	(student.contacts || []).forEach(contact => {
		if (contact.status === 'FAILED') {
			failedContactCount++;
		}
	});

	if ((student.attendance || []).length > 0 && attendCount / student.attendance.length < attendanceRateThreshold) score++;
	if ((student.assignments || []).length > 0 && assignmentCount / student.assignments.length < assignmentRateThreshold) score++;
	if (failedContactCount >= failedContactsThreshold) score++;

	const risk_level = getRiskLabel(score, cfg.riskLabels);
	return { risk_score: score, risk_level };
}

function ensureStudentRisk(student, cfg) {
	if (student && (student.risk_level === undefined || student.risk_score === undefined)) {
		const { risk_score, risk_level } = calculateRiskForStudent(student, cfg);
		student.risk_score = risk_score;
		student.risk_level = risk_level;
	}
	return student;
}

function handleGetAllStudents(req, res, query) {
	const { raw, students, cfg } = loadData();
	let updated = false;
	const withRisk = students.map(s => {
		const beforeHasRisk = s.risk_level !== undefined && s.risk_score !== undefined;
		const out = ensureStudentRisk(s, cfg);
		if (!beforeHasRisk && (out.risk_level !== undefined || out.risk_score !== undefined)) updated = true;
		return out;
	});
	if (updated) saveData(raw, withRisk);

	let result = withRisk;
	// Filtering by risk level via query.risk (e.g., Low, Medium, High)
	const riskFilter = query && typeof query.risk === 'string' ? query.risk : null;
	if (riskFilter && riskFilter.toLowerCase() !== 'all') {
        console.log("Filter backend");
		const wanted = riskFilter.toLowerCase();
		result = result.filter(s => (s.risk_level || '').toLowerCase() === wanted);
	}

	// Sorting. Currently supports sort=risk with order=asc|desc
	const sortKey = query && typeof query.sort === 'string' ? query.sort : null;
	const order = query && typeof query.order === 'string' ? query.order.toLowerCase() : 'asc';
	if (sortKey === 'risk') {
        console.log("Sort backend");
		const rank = (lvl) => {
			const v = (lvl || '').toLowerCase();
			if (v === 'low') return 1;
			if (v === 'medium') return 2;
			if (v === 'high') return 3;
			return 0;
		};
		result = [...result].sort((a, b) => {
			const ra = rank(a.risk_level);
			const rb = rank(b.risk_level);
			return order === 'desc' ? (rb - ra) : (ra - rb);
		});
	}

	respondJson(res, 200, result);
}

function handleEvaluateStudent(req, res, studentId) {
	const { raw, students, cfg } = loadData();
	const idx = students.findIndex(s => s.student_id === studentId);
	if (idx === -1) {
		respondJson(res, 404, { error: 'Student not found' });
		return;
	}
	const s = students[idx];
	const { risk_score, risk_level } = calculateRiskForStudent(s, cfg);
	const updated = { ...s, risk_score, risk_level };
	students[idx] = updated;
	saveData(raw, students);
	respondJson(res, 200, updated);
}

function handleGetStudent(req, res, studentId) {
	const { raw, students, cfg } = loadData();
	const s = students.find(x => x.student_id === studentId);
	if (!s) {
		respondJson(res, 404, { error: 'Student not found' });
		return;
	}
	const beforeHasRisk = s.risk_level !== undefined && s.risk_score !== undefined;
	const ensured = ensureStudentRisk(s, cfg);
	if (!beforeHasRisk && (ensured.risk_level !== undefined || ensured.risk_score !== undefined)) {
		saveData(raw, students);
	}
	respondJson(res, 200, ensured);
}

function respondJson(res, status, payload) {
	const body = JSON.stringify(payload, null, 2);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	});
	res.end(body);
}

function respondNoContent(res, status) {
	res.writeHead(status, {
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type'
	});
	res.end();
}

function readJsonBody(req) {
	return new Promise((resolve) => {
		let data = '';
		req.on('data', chunk => { data += chunk; });
		req.on('end', () => {
			try {
				const parsed = data ? JSON.parse(data) : {};
				resolve(parsed);
			} catch (e) {
				resolve({});
			}
		});
	});
}

function handleGetConfig(req, res) {
	const { cfg } = loadData();
	respondJson(res, 200, cfg || {});
}

async function handleUpdateThresholds(req, res) {
	const body = await readJsonBody(req);
	const { raw, students, cfg } = loadData();
	const nextCfg = { ...cfg };
	if (typeof body.attendanceRateThreshold === 'number') nextCfg.attendanceRateThreshold = body.attendanceRateThreshold;
	if (typeof body.assignmentRateThreshold === 'number') nextCfg.assignmentRateThreshold = body.assignmentRateThreshold;
	if (typeof body.failedContactsThreshold === 'number') nextCfg.failedContactsThreshold = body.failedContactsThreshold;

	let nextRaw;
	if (Array.isArray(raw)) {
		// Legacy format: promote to object with config if thresholds are set
		nextRaw = { config: nextCfg, students };
	} else {
		nextRaw = { ...raw, config: nextCfg, students };
	}

	// Recalculate risk for all students with new thresholds
	const updatedStudents = students.map(s => {
		const { risk_score, risk_level } = calculateRiskForStudent(s, nextCfg);
		return { ...s, risk_score, risk_level };
	});

	// Persist
	saveData(nextRaw, updatedStudents);

	respondJson(res, 200, { config: nextCfg, students: updatedStudents });
}

const server = http.createServer((req, res) => {
	const parsed = url.parse(req.url, true);
	const method = req.method || 'GET';
	const path = parsed.pathname || '/';

	if (method === 'OPTIONS') {
		respondNoContent(res, 204);
		return;
	}

	if (method === 'GET' && path === '/api/students') {
		handleGetAllStudents(req, res, parsed.query || {});
		return;
	}

	const studentRiskMatch = path.match(/^\/api\/students\/([^\/]+)\/risk$/);
	if (method === 'GET' && studentRiskMatch) {
		const studentId = decodeURIComponent(studentRiskMatch[1]);
		handleEvaluateStudent(req, res, studentId);
		return;
	}

	const studentGetMatch = path.match(/^\/api\/students\/([^\/]+)$/);
	if (method === 'GET' && studentGetMatch) {
		// Convert this endpoint to return ALL students rather than a single one
		handleGetAllStudents(req, res, parsed.query || {});
		return;
	}

	if (method === 'GET' && path === '/api/config') {
		handleGetConfig(req, res);
		return;
	}

	if (method === 'POST' && path === '/api/config/thresholds') {
		handleUpdateThresholds(req, res);
		return;
	}

	respondJson(res, 404, { error: 'Not Found' });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
server.listen(PORT, () => {
	console.log(`Risk API server listening on http://localhost:${PORT}`);
});
