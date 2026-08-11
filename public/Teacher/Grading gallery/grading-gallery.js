document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const viewers = document.querySelectorAll('.viewer-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            viewers.forEach(v => v.classList.remove('active'));

            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    const form = document.getElementById('gradingForm');
    const scoreInput = document.getElementById('score');
    const commentInput = document.getElementById('comment');
    const scoreError = document.getElementById('scoreError');
    const commentError = document.getElementById('commentError');
    const successMessage = document.getElementById('successMessage');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        successMessage.classList.remove('success');

        let isValid = true;
        scoreInput.classList.remove('is-invalid');
        commentInput.classList.remove('is-invalid');
        scoreError.style.display = 'none';
        commentError.style.display = 'none';

        const scoreValue = parseFloat(scoreInput.value);
        if (isNaN(scoreValue) || scoreValue < 0 || scoreValue > 10 || scoreInput.value.trim() === '') {
            scoreInput.classList.add('is-invalid');
            scoreError.style.display = 'block';
            isValid = false;
        }

        const commentValue = commentInput.value.trim();
        if (commentValue === '' || commentValue.length < 10) {
            commentInput.classList.add('is-invalid');
            commentError.style.display = 'block';
            isValid = false;
        }

        if (isValid) {
            const payload = {
                score: scoreValue,
                comment: commentValue
            };
            console.log('Dữ liệu gửi đi:', payload);

            successMessage.textContent = `Chấm điểm thành công! Điểm: ${scoreValue}`;
            successMessage.classList.add('success');
        }
    });

    scoreInput.addEventListener('input', () => {
        scoreInput.classList.remove('is-invalid');
        scoreError.style.display = 'none';
    });

    commentInput.addEventListener('input', () => {
        commentInput.classList.remove('is-invalid');
        commentError.style.display = 'none';
    });
});
