(() => {
	const API_BASE = (typeof window !== 'undefined' && window.location && /^https?:/i.test(window.location.protocol))
		? ''
		: 'http://localhost:3000';
	const tableBody = document.getElementById('studentsBody');
	const riskHeader = document.getElementById('riskHeader');
	const riskFilter = document.getElementById('riskFilter');
const refreshBtn = document.getElementById('refreshBtn');
const statusText = document.getElementById('statusText');
const loadingOverlay = document.getElementById('loadingOverlay');
	const thAttend = document.getElementById('thAttend');
	const thAssign = document.getElementById('thAssign');
	const thFailed = document.getElementById('thFailed');
	const applyCfgBtn = document.getElementById('applyCfgBtn');

	let allStudents = [];
	let riskSortAsc = true;

	function setStatus(msg) {
		statusText.textContent = msg || '';
	}

function showLoading(show) {
    if (!loadingOverlay) return;
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

	async function fetchStudents() {
		setStatus('Loading...');
		try {
			const res = await fetch(`${API_BASE}/api/students`);
			if (!res.ok) {
				alert('Failed to load students');
				setStatus('Failed to load');
				return [];
			}
			const data = await res.json();
			setStatus(`Loaded ${data.length} students`);
			return Array.isArray(data) ? data : [];
		} catch (err) {
			console.error(err);
			alert('Error loading students');
			setStatus('Error');
			return [];
		}
	}

	async function fetchConfig() {
		try {
			const res = await fetch(`${API_BASE}/api/config`);
			if (!res.ok) return null;
			return await res.json();
		} catch (e) {
			console.error(e);
			return null;
		}
	}

	async function applyThresholds() {
		const attendanceRateThreshold = parseFloat(thAttend.value);
		const assignmentRateThreshold = parseFloat(thAssign.value);
		const failedContactsThreshold = parseInt(thFailed.value, 10);
		if (Number.isNaN(attendanceRateThreshold) || Number.isNaN(assignmentRateThreshold) || Number.isNaN(failedContactsThreshold)) {
			alert('Please enter valid threshold values');
			return;
		}
    try {
        showLoading(true);
        const res = await fetch(`${API_BASE}/api/config/thresholds`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ attendanceRateThreshold, assignmentRateThreshold, failedContactsThreshold })
			});
			if (!res.ok) {
				alert('Failed to apply thresholds');
				return;
			}
			const data = await res.json();
			allStudents = Array.isArray(data.students) ? data.students : [];
			render();
			setStatus('Thresholds applied');
		} catch (e) {
			console.error(e);
			alert('Error applying thresholds');
    } finally { showLoading(false); }
	}

	function riskLevelRank(level) {
		switch ((level || '').toLowerCase()) {
			case 'low': return 1;
			case 'medium': return 2;
			case 'high': return 3;
			default: return 0;
		}
	}

	// Client-side filter/sort removed; handled by API

	function toggleDetailsRow(row, detailsDiv) {
		const isVisible = detailsDiv.style.display === 'block';
		detailsDiv.style.display = isVisible ? 'none' : 'block';
	}

	function makeSubTable(title, headers, rows) {
		const container = document.createElement('div');
		const heading = document.createElement('div');
		heading.textContent = title;
		heading.style.fontWeight = 'bold';
		heading.style.margin = '6px 0';
		container.appendChild(heading);

		const table = document.createElement('table');
		const thead = document.createElement('thead');
		const trh = document.createElement('tr');
		headers.forEach(h => {
			const th = document.createElement('th');
			th.textContent = h;
			trh.appendChild(th);
		});
		thead.appendChild(trh);
		table.appendChild(thead);

		const tbody = document.createElement('tbody');
		rows.forEach(r => {
			const tr = document.createElement('tr');
			r.forEach(cell => {
				const td = document.createElement('td');
				td.textContent = cell;
				tr.appendChild(td);
			});
			tbody.appendChild(tr);
		});
		table.appendChild(tbody);

		container.appendChild(table);
		return container;
	}

	function render() {
		tableBody.innerHTML = '';
		riskHeader.textContent = `Risk Level ${riskSortAsc ? '▴' : '▾'}`;
		let toRender = allStudents;

		toRender.forEach(s => {
			const profileRow = document.createElement('tr');
			profileRow.className = 'profile-row';
			profileRow.innerHTML = `
				<td>${s.student_id || ''}</td>
				<td>${s.student_name || ''}</td>
				<td>${s.risk_score != null ? s.risk_score : ''}</td>
				<td>${s.risk_level || ''}</td>
				<td><button type="button" data-id="${s.student_id}">Recalculate</button></td>
			`;

			const detailsRow = document.createElement('tr');
			detailsRow.className = 'details-row';
			const detailsCell = document.createElement('td');
			detailsCell.colSpan = 5;
			const detailsDiv = document.createElement('div');
			detailsDiv.className = 'details';

			const attendanceRows = (s.attendance || []).map(a => [a.date || '', a.status || '']);
			const assignmentRows = (s.assignments || []).map(a => [a.date || '', a.name || '', a.submitted ? 'Yes' : 'No']);
			const contactRows = (s.contacts || []).map(c => [c.date || '', c.status || '']);

			const subtables = document.createElement('div');
			subtables.className = 'subtables';
			subtables.appendChild(makeSubTable('Attendance', ['Date', 'Status'], attendanceRows));
			subtables.appendChild(makeSubTable('Assignments', ['Date', 'Name', 'Submitted'], assignmentRows));
			subtables.appendChild(makeSubTable('Contacts', ['Date', 'Status'], contactRows));


			detailsDiv.appendChild(subtables);
			detailsCell.appendChild(detailsDiv);
			detailsRow.appendChild(detailsCell);

			profileRow.addEventListener('click', () => toggleDetailsRow(profileRow, detailsDiv));

			const recalcBtn = profileRow.querySelector('button[data-id]');
			recalcBtn.addEventListener('click', async (evt) => {
				evt.stopPropagation();
				const id = recalcBtn.getAttribute('data-id');
			try {
				showLoading(true);
					const res = await fetch(`${API_BASE}/api/students/${encodeURIComponent(id)}/risk`);
					if (!res.ok) {
						alert('Failed to recalculate risk');
						return;
					}
					const updated = await res.json();
					const idx = allStudents.findIndex(x => x.student_id === id);
					if (idx !== -1) {
						allStudents[idx] = updated;
					}
					render();
				} catch (e) {
					console.error(e);
					alert('Error recalculating risk');
			} finally { showLoading(false); }
			});

			tableBody.appendChild(profileRow);
			tableBody.appendChild(detailsRow);
		});
	}

	async function loadAndRender() {
    try {
        showLoading(true);
        const cfg = await fetchConfig();
        if (cfg) {
            if (typeof cfg.attendanceRateThreshold === 'number') thAttend.value = cfg.attendanceRateThreshold;
            if (typeof cfg.assignmentRateThreshold === 'number') thAssign.value = cfg.assignmentRateThreshold;
            if (typeof cfg.failedContactsThreshold === 'number') thFailed.value = cfg.failedContactsThreshold;
        }
        const params = new URLSearchParams();
        const filterVal = riskFilter.value;
        if (filterVal && filterVal !== 'all') params.set('risk', filterVal);
        params.set('sort', 'risk');
        params.set('order', riskSortAsc ? 'asc' : 'desc');
        allStudents = await (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/students?${params.toString()}`);
                if (!res.ok) return [];
                return await res.json();
            } catch (e) { return []; }
        })();
        render();
    } finally {
        showLoading(false);
    }
	}

	riskHeader.addEventListener('click', () => {
		riskSortAsc = !riskSortAsc;
		loadAndRender();
	});
	riskFilter.addEventListener('change', () => loadAndRender());
	refreshBtn.addEventListener('click', () => loadAndRender());
	applyCfgBtn.addEventListener('click', () => applyThresholds());

	loadAndRender();
})();

