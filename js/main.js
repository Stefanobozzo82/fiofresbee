// Ciclo principale
// ---------- LOOP ----------
function loop(){
  if (state === 'mp'){
    mpUpdate();
    mpDraw();
  } else {
    update();
    draw();
  }
  applyPixelFilter();
  requestAnimationFrame(loop);
}
fetchBoard();
loop();
