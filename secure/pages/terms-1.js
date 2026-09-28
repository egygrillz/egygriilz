document.querySelector('.menu-toggle').addEventListener('click', () => {
    document.querySelector('.main-nav').classList.toggle('active');
    document.body.classList.toggle('menu-open');
  });
