import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Star, MessageSquareHeart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export const FeedbackModal = () => {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error("Por favor, selecione uma nota.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("ratings").insert({ rating });
    setLoading(false);

    if (error) {
      toast.error("Erro ao enviar avaliação.");
      return;
    }

    if (rating >= 4) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#FF69B4', '#8A2BE2', '#00FFFF']
      });
    }

    toast.success("Obrigado pelo seu feedback!");
    setOpen(false);
    setRating(0);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-2xl bg-background/80 backdrop-blur border-primary/20 hover:border-primary hover:bg-primary/5 transition-all duration-300 z-50 group"
        >
          <MessageSquareHeart className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md text-center glass-strong">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">Avalie nossa plataforma</DialogTitle>
        </DialogHeader>
        <div className="py-6">
          <p className="text-muted-foreground mb-6">Sua opinião é muito importante para melhorarmos!</p>
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                className="transition-transform hover:scale-110 focus:outline-none"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
              >
                <Star
                  className={`w-12 h-12 ${
                    star <= (hover || rating)
                      ? "fill-primary text-primary"
                      : "text-muted fill-transparent"
                  } transition-colors`}
                />
              </button>
            ))}
          </div>
          <Button 
            onClick={handleSubmit} 
            disabled={loading || rating === 0} 
            className="w-full gradient-brand border-0 shadow-brand h-12 text-lg"
          >
            {loading ? "Enviando..." : "Enviar Avaliação"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
