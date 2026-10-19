document.addEventListener('DOMContentLoaded', () => {
  const voteForm = document.getElementById('voteForm');
  if (voteForm) {
    voteForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const pollId = voteForm.dataset.pollid;
      const selectedOption = voteForm.querySelector('input[name="optionId"]:checked');

      if (!selectedOption) {
        alert("कृपया कोई एक विकल्प चुनें!");
        return;
      }

      try {
        const response = await fetch(`/api/polls/${pollId}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId: selectedOption.value })
        });

        const data = await response.json();

        if (data.success) {
          // फ़ॉर्म छुपाएं और नतीजे रेंडर करें
          voteForm.style.display = 'none';
          const resultsView = document.getElementById('resultsView');
          const resultsList = document.getElementById('resultsList');
          
          resultsList.innerHTML = '';
          data.options.forEach(opt => {
            resultsList.innerHTML += `
              <div class="result-bar-item" style="margin-bottom: 12px;">
                <div class="bar-info" style="display:flex; justify-content:space-between; font-size:14px; margin-bottom:4px;">
                  <strong>${opt.text}</strong>
                  <span>${opt.percentage}% (${opt.votes} वोट)</span>
                </div>
                <div class="progress-bar">
                  <div class="progress-fill" style="width: ${opt.percentage}%;"></div>
                </div>
              </div>
            `;
          });

          document.getElementById('totalVoteCount').innerText = data.totalVotes;
          resultsView.style.display = 'block';
        } else {
          alert(data.message);
        }
      } catch (err) {
        alert("वोट सबमिट करते समय तकनीकी समस्या आई।");
      }
    });
  }
});