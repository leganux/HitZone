// Logo animation
document.addEventListener('DOMContentLoaded', () => {
    // Add floating animation to logo
    const logo = document.querySelector('.ui.header.massive img');
    if (logo) {
        logo.style.animation = 'floatingCards 4s ease-in-out infinite';
    }

    // Add glow effect to segments on hover
    const segments = document.querySelectorAll('.ui.segment');
    segments.forEach(segment => {
        segment.addEventListener('mouseenter', () => {
            segment.style.transform = 'translateY(-5px)';
        });
        segment.addEventListener('mouseleave', () => {
            segment.style.transform = 'translateY(0)';
        });
    });

    // Add particle effects to the background
    createParticles();
});

// Create background particles
function createParticles() {
    const container = document.createElement('div');
    container.id = 'particles';
    container.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 0;
    `;
    document.body.prepend(container);

    for (let i = 0; i < 50; i++) {
        createParticle(container);
    }
}

function createParticle(container) {
    const particle = document.createElement('div');
    const size = Math.random() * 5 + 2;
    
    particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: ${Math.random() > 0.5 ? '#00ccff' : '#00ff9d'};
        border-radius: 50%;
        pointer-events: none;
        opacity: ${Math.random() * 0.5 + 0.2};
        animation: float ${Math.random() * 10 + 10}s linear infinite;
        top: ${Math.random() * 100}vh;
        left: ${Math.random() * 100}vw;
        box-shadow: 0 0 ${size * 2}px ${Math.random() > 0.5 ? '#00ccff' : '#00ff9d'};
    `;

    container.appendChild(particle);

    // Create keyframe animation for this specific particle
    const angle = Math.random() * 360;
    const distance = Math.random() * 100 + 50;
    
    const keyframes = `
        @keyframes float {
            0% {
                transform: translate(0, 0);
            }
            50% {
                transform: translate(
                    ${Math.cos(angle) * distance}px,
                    ${Math.sin(angle) * distance}px
                );
            }
            100% {
                transform: translate(0, 0);
            }
        }
    `;

    const style = document.createElement('style');
    style.textContent = keyframes;
    document.head.appendChild(style);
}

// Add ripple effect to buttons
document.addEventListener('DOMContentLoaded', () => {
    const buttons = document.querySelectorAll('.ui.button');
    
    buttons.forEach(button => {
        button.addEventListener('click', function(e) {
            const ripple = document.createElement('div');
            const rect = this.getBoundingClientRect();
            
            ripple.style.cssText = `
                position: absolute;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 50%;
                pointer-events: none;
                width: 100px;
                height: 100px;
                transform: translate(-50%, -50%) scale(0);
                animation: ripple 0.6s linear;
            `;
            
            ripple.style.left = e.clientX - rect.left + 'px';
            ripple.style.top = e.clientY - rect.top + 'px';
            
            this.style.position = 'relative';
            this.style.overflow = 'hidden';
            this.appendChild(ripple);
            
            setTimeout(() => ripple.remove(), 600);
        });
    });
});

// Add keyframe animation for ripple effect
const rippleStyle = document.createElement('style');
rippleStyle.textContent = `
    @keyframes ripple {
        to {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
        }
    }
`;
document.head.appendChild(rippleStyle);
