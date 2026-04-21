import { useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export const FeedbackModal = () => {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleRate = async (star: number) => {
    setRating(star);
    setLoading(true);
    const { error } = await supabase.from("ratings").insert({ rating: star });
    setLoading(false);

    if (error) {
      console.error(error);
      toast.error("Erro ao enviar avaliação.");
      return;
    }

    if (star >= 4) {
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.9, x: 0.9 },
        colors: ['#FF69B4', '#8A2BE2', '#00FFFF']
      });
    }

    setSubmitted(true);
    toast.success("Obrigado pela avaliação!");
  };

  if (submitted) return null;

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 flex items-center gap-1.5 glass-card px-3 py-2 rounded-full scale-75 sm:scale-90 origin-bottom-right opacity-30 hover:opacity-100 transition-all duration-500 z-50">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={loading}
          className="transition-transform hover:scale-125 focus:outline-none"
          onClick={() => handleRate(star)}
          onMouseEnter={() => setHover(star)}
          onMouseLeave={() => setHover(0)}
        >
          <Star
            className={`w-4 h-4 sm:w-5 sm:h-5 ${
              star <= (hover || rating)
                ? "fill-primary text-primary"
                : "text-muted-foreground/30 fill-transparent"
            } transition-colors`}
          />
        </button>
      ))}
    </div>
  );
};
